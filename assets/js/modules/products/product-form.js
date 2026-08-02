// assets/js/modules/products/product-form.js
// Builds a create/edit form whose fields are driven dynamically by
// /api/inventory/fields, so the same form works for any store type.
// Also includes a Picture upload field (image is uploaded immediately
// on selection; the returned URL is saved as the product's imageUrl).

import apiClient from '../../shared/api-client.js';
import { el } from '../../shared/utils.js';
import { validateForm } from '../../shared/validators.js';
import modalManager from '../../ui/modal-manager.js';
import notification from '../../ui/notification.js';

function inputTypeFor(fieldType) {
  switch (fieldType) {
    case 'number':
    case 'currency':
      return 'number';
    case 'date':
      return 'date';
    case 'boolean':
      return 'checkbox';
    default:
      return 'text';
  }
}

async function uploadImage(file) {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch('/api/uploads/image', { method: 'POST', body: formData });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data && data.error) || 'Image upload failed.');
  }
  return data.url;
}

function buildPictureField(values) {
  const preview = el('img', {
    src: values.imageUrl || '',
    style: `display:${values.imageUrl ? 'block' : 'none'};max-width:100px;max-height:100px;border-radius:4px;margin-bottom:0.4rem;`
  });

  const statusEl = el('div', { class: 'field-error', style: 'color:var(--color-text-muted);' }, '');

  const fileInput = el('input', {
    type: 'file',
    accept: 'image/png,image/jpeg,image/webp',
    onChange: async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      statusEl.textContent = 'Uploading...';
      try {
        const url = await uploadImage(file);
        values.imageUrl = url;
        preview.src = url;
        preview.style.display = 'block';
        statusEl.textContent = 'Image uploaded.';
      } catch (err) {
        statusEl.textContent = err.message;
      }
    }
  });

  return el('div', { class: 'form-field' }, [
    el('label', {}, 'Picture'),
    preview,
    fileInput,
    statusEl
  ]);
}

export async function openProductForm({ product = null, onSaved } = {}) {
  const schema = await apiClient.get('/inventory/fields');
  const values = { ...(product || {}) };
  const errorEls = {};

  const fields = schema.fields.map((fieldDef) => {
    const isCheckbox = fieldDef.type === 'boolean';

    const input = el('input', {
      type: inputTypeFor(fieldDef.type),
      step: fieldDef.type === 'currency' ? '0.01' : undefined,
      checked: isCheckbox && values[fieldDef.key] ? 'checked' : undefined,
      value: isCheckbox ? undefined : (values[fieldDef.key] ?? ''),
      onChange: isCheckbox ? (e) => { values[fieldDef.key] = e.target.checked; } : undefined,
      onInput: isCheckbox ? undefined : (e) => {
        const raw = e.target.value;
        values[fieldDef.key] = (fieldDef.type === 'number' || fieldDef.type === 'currency') && raw !== ''
          ? Number(raw)
          : raw;
      }
    });

    const errorEl = el('div', { class: 'field-error' }, '');
    errorEls[fieldDef.key] = errorEl;

    // Checkboxes read more naturally with the label after the control.
    const fieldChildren = isCheckbox
      ? [el('label', {}, [input, ` ${fieldDef.label}`]), errorEl]
      : [el('label', {}, `${fieldDef.label}${fieldDef.required ? ' *' : ''}`), input, errorEl];

    return el('div', { class: 'form-field' }, fieldChildren);
  });

  // Picture upload goes last, after the dynamic fields, matching the
  // real New Product form layout.
  fields.push(buildPictureField(values));

  const formEl = el('div', { class: 'product-form' }, fields);

  modalManager.open({
    title: product ? 'Edit Product' : 'New Product',
    content: formEl,
    actions: [
      { label: 'Cancel', className: 'btn-secondary' },
      {
        label: 'Submit',
        className: 'btn-primary',
        closeOnClick: false,
        onClick: async () => {
          const errors = validateForm(schema.fields, values);
          Object.entries(errorEls).forEach(([key, node]) => {
            node.textContent = errors[key] || '';
          });
          if (Object.keys(errors).length > 0) return;

          try {
            if (product) {
              await apiClient.put(`/inventory/products/${product.id}`, values);
              notification.success('Product updated.');
            } else {
              await apiClient.post('/inventory/products', values);
              notification.success('Product created.');
            }
            modalManager.close();
            onSaved?.();
          } catch (err) {
            notification.error(err.message);
          }
        }
      }
    ]
  });
}
