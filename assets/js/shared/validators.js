// assets/js/shared/validators.js
// Client-side field validation mirroring the dynamic product-field
// definitions returned by /api/inventory/fields.

export function validateField(fieldDef, value) {
  const missing = value === undefined || value === null || value === '';
  if (fieldDef.required && missing) {
    return `${fieldDef.label} is required.`;
  }
  if (missing) return null;

  switch (fieldDef.type) {
    case 'number':
    case 'currency':
      if (Number.isNaN(Number(value)) || Number(value) < 0) {
        return `${fieldDef.label} must be a non-negative number.`;
      }
      break;
    case 'date':
      if (Number.isNaN(new Date(value).getTime())) {
        return `${fieldDef.label} must be a valid date.`;
      }
      break;
    default:
      break;
  }
  return null;
}

export function validateForm(schema, values) {
  const errors = {};
  schema.forEach((fieldDef) => {
    const error = validateField(fieldDef, values[fieldDef.key]);
    if (error) errors[fieldDef.key] = error;
  });
  return errors;
}
