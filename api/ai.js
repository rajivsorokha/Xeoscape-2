// api/ai.js
// Backend for the in-app AI assistant chat widget. The browser never
// talks to any AI provider directly (that would mean shipping the API
// key to the client) -- it calls this endpoint, which holds the key
// server-side (see core/ai-settings.js) and forwards the conversation
// to whichever provider is currently active. The assistant is given a
// compact snapshot of today's low-stock and stock-on-hand numbers as
// system context, so it can answer "what should I reorder" style
// questions without extra tool-calling machinery.
//
// Each provider speaks a different request/response shape, so there's
// one small caller function per provider below rather than one
// generic path with lots of branching inline.

const express = require('express');

const MAX_HISTORY_MESSAGES = 20;

function buildSystemPrompt(storeType) {
  return [
    'You are the in-app inventory assistant for Xeoscape, a point-of-sale app.',
    `The store\'s active type is "${storeType}".`,
    'Help the merchant understand their ABC (Pareto) product classification, low stock / reorder point situation, purchase orders, and stock-on-hand value.',
    'You have been given a JSON snapshot of the current low-stock list and stock-on-hand totals below -- use it to answer questions grounded in real numbers rather than guessing.',
    'Be concise and practical. If asked to take an action the app doesn\'t expose here (e.g. actually placing an order), tell the user to use the Purchase Orders screen.'
  ].join(' ');
}

/** Anthropic Messages API. */
async function callAnthropic({ apiKey, model, systemPrompt, history }) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: history
    })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `Anthropic API error (${response.status})`);
  }
  const reply = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  return { reply, usage: data.usage || null };
}

/**
 * OpenAI-compatible chat completions -- shared by Groq and OpenRouter,
 * which both implement this same request/response shape.
 */
async function callOpenAiCompatible({ apiKey, model, systemPrompt, history, url, extraHeaders = {} }) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      ...extraHeaders
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: 'system', content: systemPrompt }, ...history]
    })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `API error (${response.status})`);
  }
  const reply = data.choices?.[0]?.message?.content || '';
  return { reply, usage: data.usage || null };
}

function callGroq(args) {
  return callOpenAiCompatible({ ...args, url: 'https://api.groq.com/openai/v1/chat/completions' });
}

function callOpenRouter(args) {
  return callOpenAiCompatible({
    ...args,
    url: 'https://openrouter.ai/api/v1/chat/completions',
    // Recommended (not required) by OpenRouter for their own analytics
    // and rate-limit routing -- harmless to include, safe to omit.
    extraHeaders: { 'X-Title': 'Xeoscape' }
  });
}

/** Google AI Studio (Gemini) generateContent API -- a different shape from the OpenAI-style ones above. */
async function callGoogle({ apiKey, model, systemPrompt, history }) {
  const contents = history.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      contents,
      systemInstruction: { parts: [{ text: systemPrompt }] }
    })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `Google AI Studio API error (${response.status})`);
  }
  const reply = (data.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  return { reply, usage: data.usageMetadata || null };
}

const PROVIDER_CALLERS = {
  anthropic: callAnthropic,
  groq: callGroq,
  google: callGoogle,
  openrouter: callOpenRouter
};

const PROVIDER_LABELS = {
  anthropic: 'Anthropic',
  groq: 'Groq',
  google: 'Google AI Studio',
  openrouter: 'OpenRouter'
};

function buildAiRouter({ aiSettings, inventoryManager, reportGenerator, storeConfig }) {
  const router = express.Router();

  // GET /api/ai/status -- whether the assistant is enabled/configured
  // for its currently active provider, without ever exposing the key.
  router.get('/status', async (req, res) => {
    const settings = await aiSettings.get();
    res.json({ configured: await aiSettings.isConfigured(), provider: settings.provider });
  });

  // POST /api/ai/chat  { messages: [{role: 'user'|'assistant', content: string}] }
  router.post('/chat', async (req, res) => {
    try {
      const settings = await aiSettings.get();
      const provider = settings.provider || 'anthropic';
      const apiKey = await aiSettings.getEffectiveApiKey();
      const model = await aiSettings.getActiveModel();
      const label = PROVIDER_LABELS[provider] || provider;

      if (!settings.enabled) {
        return res.status(400).json({ error: 'The AI assistant is turned off. Enable it in Settings \u2192 AI Assistant.' });
      }
      if (!apiKey) {
        return res.status(400).json({ error: `No ${label} API key configured. Add one in Settings \u2192 AI Assistant.` });
      }
      const caller = PROVIDER_CALLERS[provider];
      if (!caller) {
        return res.status(400).json({ error: `Unknown AI provider "${provider}".` });
      }

      const { messages } = req.body || {};
      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'messages is required and must be a non-empty array.' });
      }

      const [lowStock, stockOnHand] = await Promise.all([
        inventoryManager.lowStockReport(),
        reportGenerator.stockOnHand({})
      ]);
      const snapshot = {
        lowStockCount: lowStock.length,
        lowStockSample: lowStock.slice(0, 15),
        stockOnHand: {
          totalProducts: stockOnHand.totalProducts,
          totalUnits: stockOnHand.totalUnits,
          totalCostValue: stockOnHand.totalCostValue,
          totalRetailValue: stockOnHand.totalRetailValue
        }
      };

      const history = messages.slice(-MAX_HISTORY_MESSAGES).map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || '').slice(0, 4000)
      }));

      const systemPrompt = `${buildSystemPrompt(storeConfig.currentStoreType)}\n\nSnapshot JSON:\n${JSON.stringify(snapshot)}`;

      const { reply, usage } = await caller({ apiKey, model, systemPrompt, history });
      res.json({ reply, usage, provider });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  return router;
}

module.exports = buildAiRouter;
