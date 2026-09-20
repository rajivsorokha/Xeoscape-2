// assets/js/modules/products/product-form.js
// Builds a create/edit form whose fields are driven dynamically by
// /api/inventory/fields, so the same form works for any store type.
// Dropdown ('select') fields render as real dropdowns, and the
// barcode/SKU field carries a Generate button that allocates an
// unused code -- see the notes inline below.
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

export async function openProductForm({ product = null, initialValues = null, onSaved, onClose } = {}) {
  const schema = await apiClient.get('/inventory/fields');
  // `product` (with an id) means edit-mode -- PUT. `initialValues` just
  // pre-fills fields for a brand-new product (e.g. a scanned barcode
  // and its looked-up name) without switching to edit-mode -- POST.
  const values = { ...(product || {}), ...(initialValues || {}) };
  const errorEls = {};

  const fields = schema.fields.map((fieldDef) => {
    const isCheckbox = fieldDef.type === 'boolean';
    const isSelect = fieldDef.type === 'select' && Array.isArray(fieldDef.options);

    // A 'select' field (Garment Type, Size, Department...) renders as a
    // real dropdown. It previously fell through to a plain text box,
    // which let two people type "T-shirt" and "T Shirt" for the same
    // rail -- and inconsistent values there are exactly what breaks
    // barcode SKUs and stock reports later.
    const input = isSelect
      ? el('select', {
        onChange: (e) => { values[fieldDef.key] = e.target.value; }
      }, [
        el('option', { value: '' }, fieldDef.required ? 'Select...' : '\u2014'),
        ...fieldDef.options.map((option) => el('option', { value: option }, option))
      ])
      : el('input', {
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

    // A <select>'s value can only be set once its <option>s exist.
    if (isSelect) input.value = values[fieldDef.key] ?? '';

    const errorEl = el('div', { class: 'field-error' }, '');
    errorEls[fieldDef.key] = errorEl;

    // The barcode field gets a Generate button: unbranded and tailored
    // stock arrives with no scannable code at all, and typing a
    // 13-digit number by hand is both slow and a duplicate waiting to
    // happen. The server allocates it so it's guaranteed unique
    // against the whole catalogue (see core/barcode.js).
    let control = input;
    if (fieldDef.key === 'sku') {
      const generateBtn = el('button', {
        class: 'btn btn-sm btn-secondary',
        type: 'button',
        title: 'Allocate an unused barcode for this garment'
      }, 'Generate');

      generateBtn.addEventListener('click', async () => {
        generateBtn.disabled = true;
        try {
          const { codes } = await apiClient.post('/inventory/barcodes/generate', {
            symbology: 'CODE128',
            count: 1,
            attributes: {
              garmentType: values.garmentType,
              brand: values.brand,
              color: values.color,
              size: values.size
            }
          });
          values.sku = codes[0];
          input.value = codes[0];
          errorEl.textContent = '';
        } catch (err) {
          errorEl.textContent = err.message;
        } finally {
          generateBtn.disabled = false;
        }
      });

      control = el('div', { class: 'field-with-action' }, [input, generateBtn]);
    }

    // Checkboxes read more naturally with the label after the control.
    const fieldChildren = isCheckbox
      ? [el('label', {}, [input, ` ${fieldDef.label}`]), errorEl]
      : [el('label', {}, `${fieldDef.label}${fieldDef.required ? ' *' : ''}`), control, errorEl];

    return el('div', { class: 'form-field' }, fieldChildren);
  });

  // Picture upload goes last, after the dynamic fields, matching the
  // real New Product form layout.
  fields.push(buildPictureField(values));

  const formEl = el('div', { class: 'product-form' }, fields);

  modalManager.open({
    title: product ? 'Edit Product' : 'New Product',
    content: formEl,
    onClose,
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
