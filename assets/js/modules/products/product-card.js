// assets/js/modules/products/product-card.js
// Renders a single product tile for the product grid.

import { el } from '../../shared/utils.js';
import { formatMoney } from '../../shared/formatters.js';
import settingsStore from '../../shared/settings-store.js';

function renderImagePlaceholder(product) {
  if (product.imageUrl) {
    return el('img', { src: product.imageUrl, class: 'product-card-image', alt: product.name });
  }
  // Gray camera-icon "no image" placeholder, matching products that
  // haven't had a photo uploaded yet.
  return el('div', { class: 'product-card-image', style: 'display:flex;flex-direction:column;align-items:center;justify-content:center;color:#b6c0c2;' }, [
    el('span', { style: 'font-size:1.6rem;line-height:1;' }, '\u{1F4F7}'),
    el('span', { style: 'font-size:0.65rem;margin-top:0.25rem;letter-spacing:0.05em;' }, 'NO IMAGE')
  ]);
}

function isExpiringSoon(product, withinDays = 30) {
  if (!product.expirationDate) return false;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);
  return new Date(product.expirationDate) <= cutoff;
}

export function renderProductCard(product, { onEdit, onAddToCart } = {}) {
  const minStock = typeof product.minStock === 'number' ? product.minStock : 5;
  const lowStock = (product.stock || 0) <= minStock;
  const expiring = isExpiringSoon(product);

  const badges = [];
  if (lowStock) badges.push(el('span', { class: 'product-card-badge product-card-badge-warning' }, 'LOW STOCK'));
  if (expiring) badges.push(el('span', { class: 'product-card-badge product-card-badge-danger' }, 'EXPIRING'));

  return el('div', { class: `product-card ${lowStock ? 'product-card-low-stock' : ''}` }, [
    renderImagePlaceholder(product),
    el('div', { class: 'product-card-body' }, [
      badges.length ? el('div', { class: 'product-card-badges' }, badges) : null,
      el('h4', {}, product.name),
      el('div', { class: 'product-card-sku' }, `SKU: ${product.sku}`),
      el('div', { class: 'product-card-price' }, formatMoney(product.price, settingsStore.getCurrencySymbol())),
      el('div', { class: 'product-card-stock' }, `Stock: ${product.stock ?? 0}`),
      el('div', { class: 'product-card-actions' }, [
        el('button', { class: 'btn btn-sm btn-secondary', onClick: onEdit }, 'Edit'),
        el('button', { class: 'btn btn-sm btn-primary', onClick: onAddToCart }, 'Add to Cart')
      ])
    ])
  ]);
}
