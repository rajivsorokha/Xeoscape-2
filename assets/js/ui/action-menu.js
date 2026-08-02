// assets/js/ui/action-menu.js
// A small "..." (kebab) button that opens a dropdown list of actions,
// for toolbar actions that don't need to be a full always-visible
// button (e.g. Import CSV) alongside a primary action (e.g. New Product).

import { el } from '../shared/utils.js';

/**
 * @param {Array<{ label: string, onClick: () => void }>} items
 */
export function createActionMenu(items) {
  const list = el('div', { class: 'action-menu-list' },
    items.map((item) => el('button', {
      type: 'button',
      class: 'action-menu-item',
      onClick: () => { close(); item.onClick(); }
    }, item.label))
  );
  list.style.display = 'none';

  const toggle = el('button', {
    type: 'button',
    class: 'btn btn-secondary action-menu-toggle',
    'aria-label': 'More actions',
    onClick: (e) => {
      e.stopPropagation();
      list.style.display = list.style.display === 'none' ? 'block' : 'none';
    }
  }, '\u22ef');

  function close() {
    list.style.display = 'none';
  }

  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) close();
  });

  const wrapper = el('div', { class: 'action-menu' }, [toggle, list]);
  return wrapper;
}
