// core/ai-settings.js
// Configuration for the in-app AI assistant chat widget. Supports
// multiple providers -- Anthropic, Groq, Google AI Studio (Gemini),
// and OpenRouter -- since they use different API request/response
// formats (see api/ai.js, which branches on `provider`). Each
// provider keeps its own saved apiKey/model, so switching the active
// provider doesn't lose what was entered for the others. Persisted
// the same way as core/email-settings.js (single record, keys
// redacted on read).
//
// The Anthropic key can also be supplied via the ANTHROPIC_API_KEY
// environment variable, which is preferred when both are present --
// convenient for a store owner who already sets it at the OS/service
// level and doesn't want it sitting in the app database at all. The
// other providers don't have an equivalent env var convention here,
// so their keys are only ever the stored ones.

const SqliteStore = require('./sqlite-store');

const PROVIDERS = ['anthropic', 'groq', 'google', 'openrouter'];

// One sensible default model per provider. Anthropic's is a specific,
// verified current model (see product-self-knowledge). The others
// change lineups often (Groq in particular deprecates models on short
// notice), so these are good starting points, not guarantees -- the
// model field is always a free-text override in the settings UI.
const DEFAULT_MODELS = {
  anthropic: 'claude-sonnet-5',
  groq: 'openai/gpt-oss-120b',
  google: 'gemini-3.5-flash',
  openrouter: 'openai/gpt-4o-mini'
};

const DEFAULT_AI_SETTINGS = {
  enabled: false,
  provider: 'anthropic',
  providers: Object.fromEntries(PROVIDERS.map((p) => [p, { apiKey: '', model: DEFAULT_MODELS[p] }]))
};

class AiSettings {
  constructor(dataDir) {
    this.db = new SqliteStore(dataDir, 'ai_settings');
  }

  async get() {
    const records = await this.db.readAll();
    const stored = records[0] || {};
    // Deep-merge providers so a record saved before a given provider
    // existed (or missing one entirely) still gets sensible defaults
    // for it, rather than `undefined`.
    const providers = { ...DEFAULT_AI_SETTINGS.providers };
    for (const p of PROVIDERS) {
      providers[p] = { ...DEFAULT_AI_SETTINGS.providers[p], ...(stored.providers?.[p] || {}) };
    }
    return { ...DEFAULT_AI_SETTINGS, ...stored, providers };
  }

  async update(patch) {
    const current = await this.get();
    const next = { ...current, ...patch, providers: { ...current.providers } };

    if (patch.providers) {
      for (const p of PROVIDERS) {
        if (!patch.providers[p]) continue;
        const incoming = patch.providers[p];
        // Never let an empty-string PUT accidentally wipe a saved key
        // -- only overwrite apiKey if a new one was actually provided.
        const apiKey = incoming.apiKey === '' ? current.providers[p].apiKey : (incoming.apiKey ?? current.providers[p].apiKey);
        const model = incoming.model ?? current.providers[p].model;
        next.providers[p] = { apiKey, model };
      }
    }

    await this.db.writeAll([next]);
    return next;
  }

  /** The key actually used for API calls for the currently active provider. */
  async getEffectiveApiKey() {
    const { provider, providers } = await this.get();
    if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
    return providers[provider]?.apiKey || null;
  }

  async getActiveModel() {
    const { provider, providers } = await this.get();
    return providers[provider]?.model || DEFAULT_MODELS[provider];
  }

  async isConfigured() {
    const key = await this.getEffectiveApiKey();
    const { enabled } = await this.get();
    return Boolean(enabled && key);
  }
}

module.exports = AiSettings;
module.exports.DEFAULT_AI_SETTINGS = DEFAULT_AI_SETTINGS;
module.exports.PROVIDERS = PROVIDERS;
module.exports.DEFAULT_MODELS = DEFAULT_MODELS;
