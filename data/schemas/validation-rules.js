// data/schemas/validation-rules.js
// Shared validation primitives used across core managers and API routes.

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isValidDate(value) {
  if (!value) return true; // optional
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

function validateAgainstFieldSchema(fields, schema, { partial = false } = {}) {
  const errors = [];
  schema.forEach((fieldDef) => {
    const value = fields[fieldDef.key];
    const missing = value === undefined || value === null || value === '';

    if (fieldDef.required && missing && !partial) {
      errors.push(`${fieldDef.label} is required.`);
      return;
    }
    if (missing) return;

    switch (fieldDef.type) {
      case 'number':
      case 'currency':
        if (!isPositiveNumber(value)) errors.push(`${fieldDef.label} must be a non-negative number.`);
        break;
      case 'date':
        if (!isValidDate(value)) errors.push(`${fieldDef.label} must be a valid date.`);
        break;
      case 'text':
        if (!isNonEmptyString(String(value))) errors.push(`${fieldDef.label} must not be empty.`);
        break;
      default:
        break;
    }
  });
  return errors;
}

module.exports = {
  isNonEmptyString,
  isPositiveNumber,
  isValidDate,
  validateAgainstFieldSchema
};
