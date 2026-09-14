/** Tarjeta de producto reutilizable: galería (con foto) o fila compacta. */
import { h } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { initials, money } from '../utils/format.js';
import { photoUrl } from '../api/photos.js';
import { state } from '../state.js';
import { expiryInfo, EXPIRY } from '../services/inventory.js';
import { toggleStock } from '../services/actions.js';

/** Etiqueta de vencimiento lista para pintar (o null). */
export function expiryBadge(product) {
  const info = expiryInfo(product);
  if (info.state === EXPIRY.NONE || info.state === EXPIRY.UNSET) return null;
  if (info.state === EXPIRY.OK) return null;
  const tone = info.tone === 'danger' ? 'out' : 'low';
  return h('span', { class: `badge badge--${tone}` },
    h('span', { html: icon('clock', { size: 12 }) }), info.label);
}

function photoNode(product, { size = 'card' } = {}) {
  const url = product.photoPath ? photoUrl(product.photoPath) : null;
  if (url) {
    return h('img', { src: url, alt: '', loading: 'lazy', class: `product-photo product-photo--${size}` });
  }
  const category = state.categoriesById.get(product.categoryId);
  return h('div', {
    class: `product-photo product-photo--${size} product-photo--empty`,
    style: category ? { background: `${category.color}1f`, color: category.color } : null,
  }, category ? h('span', { html: icon(category.icon || 'tag', { size: size === 'card' ? 30 : 20 }) }) : initials(product.name));
}

/** Tarjeta grande con foto (vista galería). */
export function productCard(product, ctx) {
  const badge = expiryBadge(product);
  const category = state.categoriesById.get(product.categoryId);

  return h('article', { class: `product-card${product.inStock ? '' : ' is-out'}` },
    h('button.product-card__body', {
      type: 'button',
      onclick: () => ctx.go(`/producto/${product.id}`),
      'aria-label': `Ver ${product.name}`,
    },
    h('div.product-card__media',
      photoNode(product),
      badge ? h('div.product-card__badge', badge) : null,
      !product.inStock ? h('div.product-card__veil', h('span.badge.badge--out', 'No hay')) : null,
    ),
    h('div.product-card__info',
      h('div.product-card__name', product.name),
      h('div.product-card__meta',
        category?.name || 'Sin categoría',
        product.unit ? ` · ${product.unit}` : ''),
    )),
    h('button', {
      class: `stock-toggle ${product.inStock ? 'is-in' : 'is-out'}`,
      type: 'button',
      'aria-pressed': product.inStock ? 'true' : 'false',
      'aria-label': product.inStock ? `Marcar que ya no hay ${product.name}` : `Marcar que ya hay ${product.name}`,
      onclick: () => toggleStock(product),
    },
    h('span', { html: icon(product.inStock ? 'check' : 'cart', { size: 16 }) }),
    product.inStock ? 'Hay' : 'Comprado'),
  );
}

/** Fila compacta (vista lista). */
export function productRow(product, ctx, { showStore = false } = {}) {
  const badge = expiryBadge(product);
  const category = state.categoriesById.get(product.categoryId);
  const meta = [
    category?.name,
    showStore ? state.storesById.get(product.storeId)?.name : null,
    product.unit || null,
    product.referencePrice != null ? money(product.referencePrice) : null,
  ].filter(Boolean).join(' · ');

  return h('div', { class: `tile${product.inStock ? '' : ' tile--out'}` },
    h('button', {
      type: 'button',
      class: 'row grow',
      style: { background: 'transparent', border: 0, padding: 0, gap: '12px', textAlign: 'left' },
      onclick: () => ctx.go(`/producto/${product.id}`),
      'aria-label': `Ver ${product.name}`,
    },
    photoNode(product, { size: 'row' }),
    h('div.tile__body',
      h('div.tile__title', h('span.truncate', product.name), badge),
      h('div.tile__meta', meta || 'Sin detalles'),
    )),
    h('button', {
      class: `stock-toggle stock-toggle--sm ${product.inStock ? 'is-in' : 'is-out'}`,
      type: 'button',
      'aria-pressed': product.inStock ? 'true' : 'false',
      'aria-label': product.inStock ? `Marcar que ya no hay ${product.name}` : `Marcar que ya hay ${product.name}`,
      onclick: () => toggleStock(product),
    },
    h('span', { html: icon(product.inStock ? 'check' : 'cart', { size: 15 }) }),
    product.inStock ? 'Hay' : 'Comprado'),
  );
}

export { photoNode };
