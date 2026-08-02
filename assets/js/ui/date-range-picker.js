// assets/js/ui/date-range-picker.js
// Compact date-range dropdown matching the real app: a single button
// showing "Jul 20, 2026 - Jul 20, 2026" that opens a preset list
// (Today / Yesterday / Last 7 Days / Last 30 Days / This Month / Last
// Month / Custom Range). Custom Range reveals From/To date inputs with
// Cancel/Apply -- a simplified stand-in for the full dual-month
// calendar grid in the reference app, which would take a dedicated
// calendar-grid component to replicate pixel-for-pixel.

import { el } from '../shared/utils.js';
import { PRESETS, resolvePreset, formatRangeLabel } from '../shared/date-ranges.js';

/**
 * @param {{ initialPreset?: string, onChange: (range: {from: Date, to: Date, presetId: string, label: string}) => void }} opts
 * @returns {HTMLElement}
 */
export function createDateRangePicker({ initialPreset = 'today', onChange }) {
  let current = { ...resolvePreset(initialPreset), presetId: initialPreset };
  let open = false;
  let customFrom = current.from.toISOString().slice(0, 10);
  let customTo = current.to.toISOString().slice(0, 10);
  let showingCustomForm = false;

  const btnLabel = el('span', {}, formatRangeLabel(current.from, current.to));
  const btn = el('button', {
    type: 'button',
    class: 'date-range-btn',
    onClick: (e) => { e.stopPropagation(); toggle(); }
  }, ['\u{1F4C5} ', btnLabel, ' \u25BE']);

  const dropdown = el('div', { class: 'date-range-dropdown' });
  dropdown.style.display = 'none';

  const wrapper = el('div', { class: 'date-range-picker' }, [btn, dropdown]);

  function toggle() {
    open = !open;
    dropdown.style.display = open ? 'block' : 'none';
    if (open) { showingCustomForm = false; renderDropdown(); }
  }

  function close() {
    open = false;
    dropdown.style.display = 'none';
  }

  function selectPreset(presetId) {
    if (presetId === 'custom') {
      showingCustomForm = true;
      renderDropdown();
      return;
    }
    const range = resolvePreset(presetId);
    current = { ...range, presetId };
    btnLabel.textContent = formatRangeLabel(range.from, range.to);
    close();
    onChange({ ...range, presetId, label: PRESETS.find((p) => p.id === presetId).label });
  }

  function applyCustom() {
    // <input type="date"> gives a plain "YYYY-MM-DD" string. `new
    // Date("YYYY-MM-DD")` parses that as UTC midnight, but
    // `.setHours()` operates in LOCAL time -- mixing the two shifts the
    // actual instant by the local UTC offset. Parsing the components
    // manually and constructing local Date objects directly avoids
    // that mismatch entirely.
    const [fy, fm, fd] = customFrom.split('-').map(Number);
    const [ty, tm, td] = customTo.split('-').map(Number);
    const from = new Date(fy, fm - 1, fd, 0, 0, 0, 0);
    const to = new Date(ty, tm - 1, td, 23, 59, 59, 999);
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) return;
    current = { from, to, presetId: 'custom' };
    btnLabel.textContent = formatRangeLabel(from, to);
    close();
    onChange({ from, to, presetId: 'custom', label: 'Custom Range' });
  }

  function renderDropdown() {
    dropdown.innerHTML = '';

    if (!showingCustomForm) {
      const list = el('div', { class: 'date-range-preset-list' }, PRESETS.map((p) =>
        el('button', {
          type: 'button',
          class: `date-range-preset-item ${p.id === current.presetId ? 'active' : ''}`,
          onClick: () => selectPreset(p.id)
        }, p.label)
      ));
      dropdown.appendChild(list);
    } else {
      const fromInput = el('input', { type: 'date', value: customFrom, onInput: (e) => { customFrom = e.target.value; } });
      const toInput = el('input', { type: 'date', value: customTo, onInput: (e) => { customTo = e.target.value; } });
      dropdown.appendChild(el('div', { class: 'date-range-custom-panel' }, [
        el('div', { class: 'form-field' }, [el('label', {}, 'From'), fromInput]),
        el('div', { class: 'form-field' }, [el('label', {}, 'To'), toInput]),
        el('div', { class: 'date-range-custom-actions' }, [
          el('button', { type: 'button', class: 'btn btn-sm btn-secondary', onClick: () => { showingCustomForm = false; renderDropdown(); } }, 'Cancel'),
          el('button', { type: 'button', class: 'btn btn-sm btn-primary', onClick: applyCustom }, 'Apply')
        ])
      ]));
    }
  }

  // Close when clicking outside the picker.
  document.addEventListener('click', (e) => {
    if (open && !wrapper.contains(e.target)) close();
  });

  return wrapper;
}
