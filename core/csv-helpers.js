// core/csv-helpers.js
// Shared CSV template-generation and parsing logic for bulk import,
// used by both the product import (api/inventory.js, field schema
// varies per store type) and category import (api/categories.js, a
// fixed simple schema). Keeping this generic means every store type
// gets CSV import "for free" through the same field-schema mechanism
// that already drives per-store-type product forms and validation.

const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const SAMPLE_VALUES = {
  text: 'Sample Value',
  currency: '199.00',
  number: '10',
  date: '2026-12-31',
  boolean: 'false',
  select: '',
  list: ''
};

/**
 * Builds a downloadable CSV template matching a field schema: header
 * row of field keys, plus one example row with sample values so it's
 * obvious what format each column expects.
 * @param {Array<{key:string,type:string,options?:string[]}>} fields
 */
function buildTemplateCsv(fields) {
  const header = fields.map((f) => f.key);
  const example = fields.map((f) => {
    if (f.type === 'select' && Array.isArray(f.options) && f.options.length) return f.options[0];
    return SAMPLE_VALUES[f.type] ?? 'Sample Value';
  });
  return stringify([header, example]);
}

function coerceValue(rawValue, field) {
  const value = (rawValue ?? '').trim();
  if (value === '') return { value: undefined, error: null };

  switch (field.type) {
    case 'number':
    case 'currency': {
      const n = Number(value);
      if (Number.isNaN(n)) return { value: undefined, error: `"${value}" is not a valid number` };
      return { value: n, error: null };
    }
    case 'boolean': {
      const truthy = ['true', '1', 'yes', 'y'].includes(value.toLowerCase());
      const falsy = ['false', '0', 'no', 'n'].includes(value.toLowerCase());
      if (!truthy && !falsy) return { value: undefined, error: `"${value}" is not true/false` };
      return { value: truthy, error: null };
    }
    default:
      return { value, error: null };
  }
}

/**
 * Parses an uploaded CSV buffer against a field schema.
 * @returns {{ rows: Array<{ rowNumber: number, data: object }>, errors: Array<{ rowNumber: number, message: string }> }}
 */
function parseCsvAgainstSchema(buffer, fields) {
  let records;
  try {
    records = parse(buffer, { columns: true, skip_empty_lines: true, trim: true, bom: true });
  } catch (err) {
    return { rows: [], errors: [{ rowNumber: 0, message: `Could not parse CSV: ${err.message}` }] };
  }

  const rows = [];
  const errors = [];

  records.forEach((record, index) => {
    const rowNumber = index + 2; // +1 for 1-indexing, +1 for the header row
    const data = {};
    const rowErrors = [];

    // Match column headers case-insensitively so hand-written CSVs
    // with e.g. "Name"/"Price" (instead of "name"/"price") still work.
    const keyToHeader = new Map(
      Object.keys(record).map((h) => [h.trim().toLowerCase(), h])
    );

    fields.forEach((field) => {
      const header = keyToHeader.get(field.key.toLowerCase());
      const { value, error } = coerceValue(header ? record[header] : undefined, field);
      if (error) {
        rowErrors.push(`${field.label || field.key}: ${error}`);
        return;
      }
      if (value === undefined) {
        if (field.required) rowErrors.push(`${field.label || field.key} is required`);
        return;
      }
      data[field.key] = value;
    });

    if (rowErrors.length) {
      errors.push({ rowNumber, message: rowErrors.join('; ') });
    } else {
      rows.push({ rowNumber, data });
    }
  });

  return { rows, errors };
}

module.exports = { buildTemplateCsv, parseCsvAgainstSchema };
