// assets/js/ui/date-range-picker.js
// Date-range dropdown: a button showing "Jul 20, 2026 - Jul 20, 2026"
// that opens a preset list (Today / Yesterday / Last 7 Days / Last 30
// Days / This Month / Last Month / Custom Range). Custom Range reveals
// From/To date inputs with hour:minute:second precision, a live
// preview, and Cancel/Apply -- functionally equivalent to the
// dual-month calendar grid in the reference design, but without a
// full interactive calendar-grid widget (that's a substantial
// additional component -- happy to build it as a follow-up if the
// exact calendar-grid visual matters more than the date/time inputs).

import { el } from '../shared/utils.js';
import { PRESETS, resolvePreset, formatRangeLabel } from '../shared/date-ranges.js';

function pad(n) { return String(n).padStart(2, '0'); }
function range(start, end) { return Array.from({ length: end - start }, (_, i) => start + i); }

/**
 * @param {{ initialPreset?: string, onChange: (range: {from: Date, to: Date, presetId: string, label: string}) => void }} opts
 * @returns {HTMLElement}
 */
export function createDateRangePicker({ initialPreset = 'today', onChange }) {
  let current = { ...resolvePreset(initialPreset), presetId: initialPreset };
  let open = false;
  let customFrom = current.from.toISOString().slice(0, 10);
  let customTo = current.to.toISOString().slice(0, 10);
  let customFromTime = { h: 0, m: 0, s: 0 };
  let customToTime = { h: 23, m: 59, s: 59 };
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
    const from = new Date(fy, fm - 1, fd, customFromTime.h, customFromTime.m, customFromTime.s, 0);
    const to = new Date(ty, tm - 1, td, customToTime.h, customToTime.m, customToTime.s, 999);
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
      const fromInput = el('input', { type: 'date', value: customFrom, onInput: (e) => { customFrom = e.target.value; updatePreview(); } });
      const toInput = el('input', { type: 'date', value: customTo, onInput: (e) => { customTo = e.target.value; updatePreview(); } });
      const previewEl = el('div', { class: 'date-range-custom-preview' }, '');

      function timeSelects(time, onSet) {
        const hourSel = el('select', { class: 'date-range-time-select' }, range(0, 24).map((h) => el('option', { value: String(h) }, pad(h))));
        const minSel = el('select', { class: 'date-range-time-select' }, range(0, 60).map((m) => el('option', { value: String(m) }, pad(m))));
        const secSel = el('select', { class: 'date-range-time-select' }, range(0, 60).map((s) => el('option', { value: String(s) }, pad(s))));
        hourSel.value = String(time.h);
        minSel.value = String(time.m);
        secSel.value = String(time.s);
        hourSel.addEventListener('change', () => { onSet({ ...time, h: Number(hourSel.value) }); updatePreview(); });
        minSel.addEventListener('change', () => { onSet({ ...time, m: Number(minSel.value) }); updatePreview(); });
        secSel.addEventListener('change', () => { onSet({ ...time, s: Number(secSel.value) }); updatePreview(); });
        return el('div', { class: 'date-range-time-row' }, [hourSel, ' : ', minSel, ' : ', secSel]);
      }

      function updatePreview() {
        previewEl.textContent = `${customFrom} \u2013 ${customTo}`;
      }
      updatePreview();

      dropdown.appendChild(el('div', { class: 'date-range-custom-panel' }, [
        el('div', { class: 'date-range-custom-columns' }, [
          el('div', { class: 'form-field' }, [
            el('label', {}, 'From'),
            fromInput,
            timeSelects(customFromTime, (t) => { customFromTime = t; })
          ]),
          el('div', { class: 'form-field' }, [
            el('label', {}, 'To'),
            toInput,
            timeSelects(customToTime, (t) => { customToTime = t; })
          ])
        ]),
        previewEl,
        el('div', { class: 'date-range-custom-actions' }, [
          el('button', { type: 'button', class: 'btn btn-sm btn-secondary', onClick: () => { showingCustomForm = false; renderDropdown(); } }, 'Cancel'),
          el('button', { type: 'button', class: 'btn btn-sm btn-primary', onClick: applyCustom }, 'Apply')
        ])
      ]));
    }
  }

  // Close when clicking outside the picker. Any click that originates
  // inside the dropdown is stopped from bubbling to `document` at all
  // (see below) -- without that, selecting "Custom Range" replaces the
  // dropdown's contents (removing the very button just clicked from
  // the DOM) before this listener runs, so `wrapper.contains(e.target)`
  // wrongly evaluates to false against the now-detached button and
  // closes the dropdown the instant it opens the custom form.
  document.addEventListener('click', (e) => {
    if (open && !wrapper.contains(e.target)) close();
  });
  dropdown.addEventListener('click', (e) => e.stopPropagation());

  return wrapper;
}
