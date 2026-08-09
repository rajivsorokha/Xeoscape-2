// assets/js/modules/ai-assistant/chat-widget.js
// "Ask AI" assistant, docked in the top nav bar next to Logout.
// Collapsed it's a small pill; clicking it drops the chat panel down
// below/beside it. Talks to /api/ai/chat (see api/ai.js), which holds
// the provider API key server-side. Only actually renders once the
// assistant is enabled+configured in Settings -> AI Assistant (see
// ai-settings-panel.js); re-checks on the 'ai-assistant:settings-changed'
// event that panel dispatches after a save, so turning it on/off takes
// effect without a reload.

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';

export function mountAiAssistantWidget(navContainer) {
  let mounted = false;
  let open = false;
  let sending = false;
  let messages = [];

  const dock = el('div', { class: 'ai-assistant-dock', style: 'display:none;' });
  navContainer.appendChild(dock);

  const toggleBtn = el('button', { class: 'ai-assistant-toggle', type: 'button' }, ['\u{1F4AC} Ask AI']);
  // The panel is appended to document.body, not `dock` -- the nav bar
  // (.app-header-row) has overflow-y:hidden so it can scroll
  // horizontally when there are many buttons, which would silently
  // clip a dropdown positioned relative to something inside it. Instead
  // its position is calculated from the toggle button's actual screen
  // coordinates each time it opens, sidestepping that entirely.
  const panel = el('div', { class: 'ai-assistant-panel', style: 'display:none;' });
  const messagesEl = el('div', { class: 'ai-assistant-messages' });
  const input = el('textarea', {
    class: 'ai-assistant-input',
    rows: '2',
    placeholder: 'Ask about low stock, purchase orders, stock value\u2026'
  });
  const sendBtn = el('button', { class: 'btn btn-primary btn-sm', type: 'button' }, 'Send');

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  function positionPanel() {
    const rect = toggleBtn.getBoundingClientRect();
    panel.style.top = `${rect.bottom + 8}px`;
    panel.style.right = `${window.innerWidth - rect.right}px`;
  }

  function openPanel() {
    open = true;
    positionPanel();
    panel.style.display = 'flex';
    input.focus();
  }
  function closePanel() {
    open = false;
    panel.style.display = 'none';
  }

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    open ? closePanel() : openPanel();
  });
  panel.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => { if (open) closePanel(); });
  window.addEventListener('resize', () => { if (open) positionPanel(); });

  sendBtn.addEventListener('click', send);

  function appendMessage(role, content) {
    messagesEl.appendChild(el('div', { class: `ai-assistant-msg ai-assistant-msg-${role}` }, content));
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  async function send() {
    const text = input.value.trim();
    if (!text || sending) return;
    input.value = '';
    messages.push({ role: 'user', content: text });
    appendMessage('user', text);

    sending = true;
    sendBtn.disabled = true;
    const thinkingEl = el('div', { class: 'ai-assistant-msg ai-assistant-msg-assistant ai-assistant-thinking' }, 'Thinking\u2026');
    messagesEl.appendChild(thinkingEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    try {
      const result = await apiClient.post('/ai/chat', { messages });
      thinkingEl.remove();
      messages.push({ role: 'assistant', content: result.reply });
      appendMessage('assistant', result.reply);
    } catch (err) {
      thinkingEl.remove();
      appendMessage('assistant', `\u26A0 ${err.message}`);
    } finally {
      sending = false;
      sendBtn.disabled = false;
    }
  }

  panel.appendChild(messagesEl);
  panel.appendChild(el('div', { class: 'ai-assistant-input-row' }, [input, sendBtn]));
  dock.appendChild(toggleBtn);
  document.body.appendChild(panel);

  async function refreshVisibility() {
    try {
      const { configured } = await apiClient.get('/ai/status');
      dock.style.display = configured ? 'inline-flex' : 'none';
      if (!configured) closePanel();
      if (configured && !mounted) {
        mounted = true;
        appendMessage('assistant', 'Hi! I can help with low stock, purchase orders, ABC product grades, and stock-on-hand value. What would you like to know?');
      }
    } catch (err) {
      dock.style.display = 'none';
    }
  }

  window.addEventListener('ai-assistant:settings-changed', refreshVisibility);
  refreshVisibility();
}
