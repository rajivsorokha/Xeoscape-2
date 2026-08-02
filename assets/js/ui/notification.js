// assets/js/ui/notification.js
// Simple toast notification system (originally a Notiflix wrapper;
// reimplemented dependency-free so the module boundary stays the same
// if a real library is swapped in later).

import { el } from '../shared/utils.js';

function ensureContainer() {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = el('div', { id: 'toast-container', class: 'toast-container' });
    document.body.appendChild(container);
  }
  return container;
}

function show(message, type = 'info', durationMs = 3000) {
  const container = ensureContainer();
  const toast = el('div', { class: `toast toast-${type}` }, message);
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-fade-out');
    setTimeout(() => toast.remove(), 300);
  }, durationMs);
}

export default {
  success: (msg) => show(msg, 'success'),
  error: (msg) => show(msg, 'error', 4000),
  info: (msg) => show(msg, 'info'),
  warning: (msg) => show(msg, 'warning')
};
