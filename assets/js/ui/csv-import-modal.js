// assets/js/ui/csv-import-modal.js
// Shared "Import CSV" flow: file picker + upload + per-row result
// summary. Used by both the Products view and the Categories view --
// they just point it at different template/import endpoints.

import { el } from '../shared/utils.js';
import modalManager from './modal-manager.js';
import apiClient from '../shared/api-client.js';
import notification from './notification.js';

/**
 * @param {{
 *   title: string,
 *   templateEndpoint: string,
 *   templateFilename: string,
 *   importEndpoint: string,
 *   onImported?: () => void
 * }} opts
 */
export function openCsvImportModal({ title, templateEndpoint, templateFilename, importEndpoint, onImported }) {
  let selectedFile = null;

  const fileNameLabel = el('span', { class: 'csv-import-filename' }, 'No file selected');
  const resultBox = el('div', { class: 'csv-import-result' });

  const fileInput = el('input', {
    type: 'file',
    accept: '.csv,text/csv',
    onChange: (e) => {
      selectedFile = e.target.files[0] || null;
      fileNameLabel.textContent = selectedFile ? selectedFile.name : 'No file selected';
      resultBox.innerHTML = '';
    }
  });

  const downloadTemplateBtn = el('button', {
    type: 'button',
    class: 'btn btn-sm btn-secondary',
    onClick: async () => {
      try {
        await apiClient.downloadFile(templateEndpoint, templateFilename);
      } catch (err) {
        notification.error(`Could not download template: ${err.message}`);
      }
    }
  }, '\u2b07 Download CSV Template');

  const content = el('div', { class: 'csv-import-modal-body' }, [
    el('p', {}, 'Download the template to see the exact columns expected, fill it in, then upload it below.'),
    downloadTemplateBtn,
    el('div', { class: 'csv-import-file-row' }, [
      el('label', { class: 'btn btn-sm btn-secondary file-picker-label' }, ['Choose File', fileInput]),
      fileNameLabel
    ]),
    resultBox
  ]);

  async function doImport() {
    if (!selectedFile) {
      notification.error('Choose a CSV file first.');
      return;
    }
    resultBox.innerHTML = '';
    resultBox.appendChild(el('div', {}, 'Importing...'));
    try {
      const result = await apiClient.uploadFile(importEndpoint, selectedFile);
      renderResult(result);
      if (result.createdCount > 0 && onImported) onImported();
    } catch (err) {
      resultBox.innerHTML = '';
      resultBox.appendChild(el('div', { class: 'csv-import-error' }, `Import failed: ${err.message}`));
    }
  }

  function renderResult(result) {
    resultBox.innerHTML = '';
    resultBox.appendChild(el('div', { class: 'csv-import-summary' },
      `${result.createdCount} of ${result.totalRows} row(s) imported successfully.`
    ));
    if (result.errors && result.errors.length) {
      resultBox.appendChild(el('div', { class: 'csv-import-errors-title' }, `${result.errors.length} row(s) had problems:`));
      const list = el('ul', { class: 'csv-import-errors-list' },
        result.errors.map((e) => el('li', {}, `Row ${e.rowNumber}: ${e.message}`))
      );
      resultBox.appendChild(list);
    }
  }

  modalManager.open({
    title,
    content,
    size: 'lg',
    actions: [
      { label: 'Cancel', className: 'btn-secondary' },
      { label: 'Import', className: 'btn-primary', closeOnClick: false, onClick: doImport }
    ]
  });
}
