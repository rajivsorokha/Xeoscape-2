// assets/js/ui/modal-manager.js
// Lightweight modal dialog manager (no external dependency required).

import { el } from '../shared/utils.js';

class ModalManager {
  constructor() {
    this.overlay = null;
    this.onCloseCallback = null;
  }

  open({ title = '', content, actions = [], size = 'default', onClose = null }) {
    this.close();
    this.onCloseCallback = onClose;

    const actionButtons = actions.map((action) =>
      el('button', {
        class: `btn ${action.className || 'btn-secondary'}`,
        onClick: () => {
          if (action.onClick) action.onClick();
          if (action.closeOnClick !== false) this.close();
        }
      }, action.label)
    );

    const modal = el('div', { class: `modal-dialog ${size === 'lg' ? 'modal-dialog-lg' : ''}` }, [
      el('div', { class: 'modal-header' }, [
        el('h3', {}, title),
        el('button', { class: 'modal-close', onClick: () => this.close() }, '\u00d7')
      ]),
      el('div', { class: 'modal-body' }, content instanceof Node ? content : document.createTextNode(content || '')),
      actions.length ? el('div', { class: 'modal-actions' }, actionButtons) : null
    ]);

    this.overlay = el('div', { class: 'modal-overlay', onClick: (e) => {
      if (e.target === this.overlay) this.close();
    } }, modal);

    document.body.appendChild(this.overlay);
  }

  close() {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
    }
    this.overlay = null;
    // Fire and clear regardless of *why* the modal closed (Save,
    // Cancel, the X button, or clicking the overlay) -- callers that
    // need to run cleanup (e.g. refocusing a scan input for the next
    // scan) shouldn't have to duplicate that across every action.
    const callback = this.onCloseCallback;
    this.onCloseCallback = null;
    if (callback) callback();
  }
}

export default new ModalManager();
