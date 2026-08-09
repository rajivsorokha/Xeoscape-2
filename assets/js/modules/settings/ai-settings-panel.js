// assets/js/modules/settings/ai-settings-panel.js
// "AI Assistant" section: turns the chat widget on/off, and lets the
// merchant pick which AI provider powers it -- Anthropic, Groq,
// Google AI Studio, or OpenRouter -- each with its own saved API key
// and model (see core/ai-settings.js). Keys are redacted on read (see
// api/settings.js /ai) and are only ever sent to the chosen provider
// from the backend (api/ai.js) -- never exposed to the browser.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import notification from '../../ui/notification.js';

// Anthropic gets a real dropdown of verified current models. The
// others change their lineups often enough (Groq in particular
// deprecates models on short notice) that a free-text field with a
// sensible placeholder is more honest than a hardcoded list that
// could go stale.
const PROVIDERS = [
  {
    id: 'anthropic',
    label: 'Anthropic',
    keyPlaceholder: 'sk-ant-...',
    keyHelp: 'Get a key at console.anthropic.com',
    modelKind: 'select',
    models: ['claude-sonnet-5', 'claude-opus-4-8', 'claude-haiku-4-5-20251001']
  },
  {
    id: 'groq',
    label: 'Groq',
    keyPlaceholder: 'gsk_...',
    keyHelp: 'Get a key at console.groq.com',
    modelKind: 'text',
    modelPlaceholder: 'e.g. openai/gpt-oss-120b'
  },
  {
    id: 'google',
    label: 'Google AI Studio',
    keyPlaceholder: 'AIza...',
    keyHelp: 'Get a key at aistudio.google.com/apikey',
    modelKind: 'text',
    modelPlaceholder: 'e.g. gemini-3.5-flash'
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    keyPlaceholder: 'sk-or-...',
    keyHelp: 'Get a key at openrouter.ai/keys',
    modelKind: 'text',
    modelPlaceholder: 'e.g. openai/gpt-4o-mini, anthropic/claude-3.5-sonnet\u2026'
  }
];

export async function mountAiSettings(container) {
  container.appendChild(el('h3', {}, 'AI Assistant'));
  container.appendChild(el('p', { class: 'settings-hint' },
    'Powers the chat assistant docked at the top of the app, which can answer questions about your low-stock list, purchase orders, and stock-on-hand value. Pick a provider below and add its API key -- your keys for each provider are saved separately, so switching back and forth doesn\u2019t lose them.'
  ));

  const settings = await apiClient.get('/settings/ai');
  // Working copy: only ever send a provider's apiKey in the PUT body
  // if the user actually typed a new one for it (see pendingKeys).
  let activeProvider = settings.provider || 'anthropic';
  let enabled = Boolean(settings.enabled);
  const pendingKeys = {}; // { [providerId]: newlyTypedKey }
  const pendingModels = {}; // { [providerId]: newModelValue }

  const enabledCheckbox = el('input', {
    type: 'checkbox',
    checked: enabled,
    onChange: (e) => { enabled = e.target.checked; }
  });

  const providerSelect = el('select', {
    onChange: (e) => { activeProvider = e.target.value; renderProviderFields(); }
  }, PROVIDERS.map((p) => el('option', { value: p.id }, p.label)));
  providerSelect.value = activeProvider;

  const providerFieldsWrap = el('div', {});

  function renderProviderFields() {
    providerFieldsWrap.innerHTML = '';
    const def = PROVIDERS.find((p) => p.id === activeProvider);
    const saved = settings.providers?.[activeProvider] || { apiKeySet: false, model: '' };

    const apiKeyInput = el('input', {
      type: 'password',
      value: pendingKeys[activeProvider] || '',
      placeholder: saved.apiKeySet ? '(unchanged \u2014 leave blank to keep)' : def.keyPlaceholder,
      onInput: (e) => { pendingKeys[activeProvider] = e.target.value; }
    });

    let modelField;
    if (def.modelKind === 'select') {
      modelField = el('select', {
        onChange: (e) => { pendingModels[activeProvider] = e.target.value; }
      }, def.models.map((m) => el('option', { value: m }, m)));
      modelField.value = pendingModels[activeProvider] ?? saved.model ?? def.models[0];
    } else {
      modelField = el('input', {
        type: 'text',
        value: pendingModels[activeProvider] ?? saved.model ?? '',
        placeholder: def.modelPlaceholder,
        onInput: (e) => { pendingModels[activeProvider] = e.target.value; }
      });
    }

    providerFieldsWrap.appendChild(el('div', { class: 'form-field' }, [
      el('label', {}, `${def.label} API Key`),
      apiKeyInput,
      el('p', { class: 'settings-hint' }, def.keyHelp)
    ]));
    providerFieldsWrap.appendChild(el('div', { class: 'form-field' }, [
      el('label', {}, 'Model'),
      modelField
    ]));

    if (def.id === 'anthropic') {
      providerFieldsWrap.appendChild(el('p', { class: 'settings-hint' },
        'An Anthropic key can also be set via the ANTHROPIC_API_KEY environment variable on the machine running the backend, which takes precedence over the key saved here.'
      ));
    }
  }
  renderProviderFields();

  container.appendChild(el('div', { class: 'email-settings-form' }, [
    el('div', { class: 'form-field' }, [el('label', { class: 'perm-checkbox' }, [enabledCheckbox, ' Enable AI Assistant chat widget'])]),
    el('div', { class: 'form-field' }, [el('label', {}, 'Provider'), providerSelect]),
    providerFieldsWrap,
    el('div', { style: 'display:flex; gap:0.5rem; margin-top:0.5rem;' }, [
      el('button', {
        class: 'btn btn-primary',
        onClick: async () => {
          const providersPatch = {};
          for (const [id, apiKey] of Object.entries(pendingKeys)) {
            providersPatch[id] = { ...(providersPatch[id] || {}), apiKey };
          }
          for (const [id, model] of Object.entries(pendingModels)) {
            providersPatch[id] = { ...(providersPatch[id] || {}), model };
          }
          try {
            const updated = await apiClient.put('/settings/ai', {
              enabled,
              provider: activeProvider,
              providers: providersPatch
            });
            notification.success('AI Assistant settings saved.');
            Object.assign(settings, updated);
            for (const id of Object.keys(pendingKeys)) delete pendingKeys[id];
            renderProviderFields();
            window.dispatchEvent(new CustomEvent('ai-assistant:settings-changed'));
          } catch (err) {
            notification.error(err.message);
          }
        }
      }, 'Save AI Assistant Settings')
    ])
  ]));
}
