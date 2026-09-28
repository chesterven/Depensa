/** Ficha del producto. */
import { h } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';
import { money, moneyOrDash } from '../../utils/format.js';
import { formatDate, formatRelative } from '../../utils/date.js';
import { state } from '../../state.js';
import { photoUrl } from '../../api/photos.js';
import { expiryInfo, EXPIRY, expiryPresets, durationInfo, formatDuration } from '../../services/inventory.js';
import { toggleStock, removeProduct, setExpiry } from '../../services/actions.js';
import { emptyState } from '../ui/empty.js';
import { openSheet } from '../ui/sheet.js';
import { confirmDialog } from '../ui/confirm.js';
import { input } from '../ui/form.js';
import { openProductForm } from '../product-form.js';
import { photoNode } from '../product-card.js';

export function render(ctx) {
  const product = state.productsById.get(ctx.params.id);
  if (!product) {
    ctx.setHeader({ title: 'Producto', back: true });
    return emptyState({
      iconName: 'alert',
      title: 'Producto no encontrado',
      text: 'Es posible que otro miembro del hogar lo haya eliminado.',
      actionLabel: 'Ir al inventario',
      onAction: () => ctx.go('/inventario'),
    });
  }

  ctx.setHeader({
    title: product.name,
    subtitle: state.categoriesById.get(product.categoryId)?.name || 'Sin categoría',
    back: true,
    actions: [
      { iconName: 'pencil', label: 'Editar', onClick: () => openProductForm(product) },
      { iconName: 'trash', label: 'Eliminar', onClick: () => confirmRemove() },
    ],
  });
  ctx.onState(() => ctx.refresh());

  const info = expiryInfo(product);
  const duration = durationInfo(product);
  const root = h('div');

  /* ---- Foto y estado ---- */
  const photo = product.photoPath
    ? h('img.product-hero__photo', { src: photoUrl(product.photoPath), alt: `Foto de ${product.name}` })
    : h('div.product-hero__photo.product-hero__photo--empty', photoNode(product));

  root.appendChild(h('div.card.product-hero',
    photo,
    h('div.row.row--wrap', { style: { gap: '6px', marginTop: '12px' } },
      h('span', { class: `badge badge--${product.inStock ? 'ok' : 'out'}` }, product.inStock ? 'Hay en casa' : 'No hay'),
      product.unit ? h('span.badge.badge--done', product.unit) : null,
      info.state === EXPIRY.EXPIRED || info.state === EXPIRY.TODAY
        ? h('span.badge.badge--out', info.label)
        : info.state === EXPIRY.SOON ? h('span.badge.badge--low', info.label) : null,
    ),
    product.notes ? h('p.muted.small', { style: { marginTop: '10px', marginBottom: 0 } }, product.notes) : null,
    h('button', {
      class: `btn btn-block mt-2 ${product.inStock ? 'btn-soft' : 'btn-primary'}`,
      type: 'button',
      onclick: () => toggleStock(product),
    },
    h('span', { html: icon(product.inStock ? 'cart' : 'check', { size: 18 }) }),
    product.inStock ? 'Se acabó, ponlo en la lista' : 'Ya lo compré'),
  ));

  /* ---- Cuánto dura en casa ---- */
  root.appendChild(durationCard());

  /* ---- Detalles ---- */
  root.appendChild(h('div.card.mt-2',
    h('div.card-head', h('h3', 'Detalles')),
    infoRow('tag', 'Categoría', state.categoriesById.get(product.categoryId)?.name || 'Sin categoría', () => openProductForm(product)),
    infoRow('store', 'Comercio', state.storesById.get(product.storeId)?.name || 'Sin comercio', () => openProductForm(product)),
    product.tracksExpiry
      ? infoRow('clock', 'Vencimiento',
        product.expiresOn ? `${formatDate(product.expiresOn)} · ${info.label}` : 'Sin fecha registrada',
        () => openExpirySheet())
      : infoRow('clock', 'Vencimiento', 'No aplica', () => openProductForm(product)),
    infoRow('calculator', 'Precio de referencia', moneyOrDash(product.referencePrice), () => openProductForm(product)),
    infoRow('cart', 'Fecha de compra',
      product.purchasedOn ? formatDate(product.purchasedOn) : 'Sin registrar',
      () => openProductForm(product)),
    infoRow('refresh', product.inStock ? 'Repuesto' : 'Se acabó', formatRelative(product.statusChangedAt)),
    infoRow('calendar', 'Agregado', formatDate(product.createdAt)),
  ));

  return root;

  /** Tarjeta «cuánto dura»: el promedio y, si está en casa, cuánto lleva abierto. */
  function durationCard() {
    const card = h('div.card.mt-2',
      h('div.card-head',
        h('h3', 'Cuánto dura en casa'),
        duration.known ? h('span.badge.badge--done', duration.cycles === 1 ? '1 vez' : `${duration.cycles} veces`) : null));

    if (!duration.known) {
      card.appendChild(h('div.row', { style: { gap: '12px', alignItems: 'flex-start' } },
        h('span.menu-item__icon', { html: icon('clock', { size: 18 }) }),
        h('div.grow',
          h('div', { style: { fontWeight: 600 } }, duration.label),
          h('div.muted.small', duration.hint))));
      if (duration.elapsedLabel) {
        card.appendChild(h('p.muted.small', { style: { marginBottom: 0, marginTop: '10px' } },
          `Lleva ${duration.elapsedLabel} en casa.`));
      }
      return card;
    }

    card.appendChild(h('div.hero', { style: { marginTop: '4px' } },
      h('div.hero__label', 'Te dura en promedio'),
      h('div.hero__value', duration.label),
      h('div.hero__meta',
        duration.minDays !== duration.maxDays
          ? h('span.hero__chip',
            h('span', { html: icon('scale', { size: 16 }) }),
            `Entre ${formatDuration(duration.minDays)} y ${formatDuration(duration.maxDays)}`)
          : null,
      )));

    card.appendChild(h('p.muted.small', { style: { marginTop: '10px', marginBottom: 0 } }, duration.hint));

    if (duration.elapsedLabel) {
      // .notice ya es ámbar por defecto; --info lo vuelve azul informativo
      card.appendChild(h('div', { class: `notice mt-2 ${duration.overdue ? '' : 'notice--info'}` },
        h('span', { html: icon(duration.overdue ? 'alert' : 'clock', { size: 18 }) }),
        h('span.grow', duration.overdue
          ? `Lleva ${duration.elapsedLabel} en casa, más de lo habitual. ¿Ya se acabó?`
          : `Lleva ${duration.elapsedLabel} en casa.`)));
    }

    return card;
  }

  function infoRow(iconName, label, value, onClick = null) {
    const content = h('div.row', { style: { gap: '12px', padding: '11px 0', borderTop: '1px solid var(--line)' } },
      h('span.menu-item__icon', { style: { width: '34px', height: '34px' }, html: icon(iconName, { size: 17 }) }),
      h('div.grow', h('div.muted.small', label), h('div', { style: { fontWeight: 600 } }, value)),
      onClick ? h('span.chevron.muted', { html: icon('chevronRight', { size: 18 }) }) : null,
    );
    if (!onClick) return content;
    return h('button', {
      type: 'button',
      style: { display: 'block', width: '100%', background: 'transparent', border: 0, padding: 0, textAlign: 'left' },
      onclick: onClick,
    }, content);
  }

  function openExpirySheet() {
    const dateInput = input({ type: 'date', value: product.expiresOn || '' });
    openSheet({
      title: 'Fecha de vencimiento',
      subtitle: product.name,
      content: (api) => h('div',
        h('div.chip-row', { style: { marginBottom: '12px' } },
          ...expiryPresets().map((preset) => h('button.chip', {
            type: 'button',
            onclick: () => { dateInput.value = preset.value; },
          }, preset.label))),
        h('label.field__label', 'Fecha'),
        dateInput,
        h('button.btn.btn-ghost.btn-sm.btn-block.mt-2', {
          type: 'button',
          onclick: async () => { api.close(); await setExpiry(product, null); },
        }, 'Quitar la fecha'),
      ),
      actions: [
        { label: 'Cancelar', variant: 'btn-soft', onClick: () => {} },
        {
          label: 'Guardar',
          variant: 'btn-primary',
          onClick: async () => { await setExpiry(product, dateInput.value || null); },
        },
      ],
    });
  }

  async function confirmRemove() {
    const ok = await confirmDialog({
      title: `¿Eliminar «${product.name}»?`,
      message: 'Se borrará del inventario de todos los dispositivos del hogar.',
      detail: product.photoPath ? 'También se eliminará su fotografía.' : null,
    });
    if (!ok) return;
    const done = await removeProduct(product);
    if (done) ctx.go('/inventario');
  }
}

export { money };
