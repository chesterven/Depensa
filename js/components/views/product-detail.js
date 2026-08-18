/** Ficha del producto: estado, precios, comparación de comercios e historial. */
import { h, haptic } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';
import { money, moneyOrDash, qty as fmtQty, percent, initials, toNumber } from '../../utils/format.js';
import { formatDate, formatRelative } from '../../utils/date.js';
import { state } from '../../state.js';
import { getPhoto } from '../../database/photos.js';
import { statusOf, STATUS, STATUS_LABEL, adjustQuantity, setQuantity, markAsOut, deleteProduct } from '../../services/inventory-service.js';
import { productPriceStats, statsByStoreFor, priceSeries } from '../../services/price-service.js';
import { addItem } from '../../services/shopping-service.js';
import { deletePurchase } from '../../services/purchase-service.js';
import { sparkline } from '../ui/chart.js';
import { emptyState } from '../ui/empty.js';
import { openSheet } from '../ui/sheet.js';
import { confirmDialog } from '../ui/confirm.js';
import { toastOk, toastError } from '../ui/toast.js';
import { openProductForm } from '../product-form.js';
import { openPurchaseForm } from '../purchase-form.js';

export function render(ctx) {
  const product = state.productsById.get(ctx.params.id);
  if (!product) {
    ctx.setHeader({ title: 'Producto', back: true });
    return emptyState({
      iconName: 'alert',
      title: 'Producto no encontrado',
      text: 'Es posible que se haya eliminado.',
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
      { iconName: 'trash', label: 'Eliminar', onClick: () => removeProduct() },
    ],
  });
  ctx.onState(() => ctx.refresh());

  const status = statusOf(product);
  const statusKey = status === STATUS.OK ? 'ok' : status === STATUS.LOW ? 'low' : 'out';
  const stats = productPriceStats(product.id);
  const storeRows = statsByStoreFor(product.id);
  const purchases = [...(state.purchasesByProduct.get(product.id) || [])].reverse();
  const root = h('div');

  /* ---- Encabezado ---- */
  const thumb = h('div', { class: `thumb thumb--lg thumb--${statusKey}` }, initials(product.name));
  if (product.hasPhoto) {
    getPhoto(product.id).then((photo) => {
      if (photo?.dataUrl) thumb.replaceChildren(h('img', { src: photo.dataUrl, alt: `Foto de ${product.name}` }));
    }).catch(() => {});
  }

  const quantityInput = h('input.stepper__value', {
    type: 'number',
    step: 'any',
    min: '0',
    value: product.currentQuantity,
    'aria-label': 'Cantidad disponible',
    'data-keep-focus': 'qty',
    onchange: async (event) => {
      try { await setQuantity(product.id, toNumber(event.target.value, 0)); } catch (error) { toastError(error); }
    },
  });

  root.appendChild(h('div.card',
    h('div.row', { style: { gap: '14px', alignItems: 'flex-start' } },
      thumb,
      h('div.grow',
        h('h2', { style: { marginBottom: '4px' } }, product.name),
        h('div.row.row--wrap', { style: { gap: '6px' } },
          h('span', { class: `badge badge--${statusKey}` }, STATUS_LABEL[status]),
          h('span.badge.badge--done', product.unit),
          product.minimumQuantity ? h('span.badge.badge--done', `mín. ${fmtQty(product.minimumQuantity)}`) : null,
        ),
        product.notes ? h('p.muted.small', { style: { marginTop: '8px', marginBottom: 0 } }, product.notes) : null,
      ),
    ),
    h('div.mt-2',
      h('div.row.row--between', { style: { gap: '12px', flexWrap: 'wrap' } },
        h('div.muted.small', 'Cantidad disponible'),
        product.lastPurchaseDate
          ? h('div.muted.small.text-right', `Última compra ${formatRelative(product.lastPurchaseDate)}`,
            state.storesById.get(product.lastStoreId)?.name ? ` · ${state.storesById.get(product.lastStoreId).name}` : '')
          : null,
      ),
      h('div',
        h('div.stepper', { style: { marginTop: '6px' } },
          h('button', {
            type: 'button', 'aria-label': 'Quitar uno',
            disabled: Number(product.currentQuantity) <= 0,
            html: icon('minus', { size: 18 }),
            onclick: async () => { haptic(); await adjustQuantity(product.id, -1); },
          }),
          quantityInput,
          h('button', {
            type: 'button', 'aria-label': 'Agregar uno',
            html: icon('plus', { size: 18 }),
            onclick: async () => { haptic(); await adjustQuantity(product.id, 1); },
          }),
        ),
      ),
    ),
    h('div.row.mt-2', { style: { gap: '8px' } },
      h('button.btn.btn-primary.grow', {
        type: 'button',
        onclick: () => openPurchaseForm({ productId: product.id }),
      }, h('span', { html: icon('cart', { size: 18 }) }), 'Registrar compra'),
      status === STATUS.OK
        ? h('button.btn.btn-soft', {
          type: 'button',
          onclick: async () => {
            await markAsOut(product.id);
            toastOk('Marcado como agotado y agregado a la lista');
          },
        }, 'Marcar agotado')
        : h('button.btn.btn-soft', {
          type: 'button',
          onclick: async () => {
            await addItem({ productId: product.id, name: product.name, quantity: 1 });
            toastOk('Agregado a la lista de compras');
          },
        }, h('span', { html: icon('list', { size: 18 }) }), 'A la lista'),
    ),
  ));

  /* ---- Estadísticas de precio ---- */
  const priceSection = h('div.section',
    h('div.section-title', h('span', { html: icon('chart', { size: 19 }) }), 'Precios'));

  if (!stats.count) {
    priceSection.appendChild(h('div.card', h('div.muted.small',
      'Aún no hay compras registradas de este producto. Registra una compra para calcular el precio promedio.')));
  } else {
    priceSection.appendChild(h('div.stat-grid',
      miniStat('Promedio', money(stats.avg), 'stat--accent'),
      miniStat('Último', money(stats.last), ''),
      miniStat('Mínimo', moneyOrDash(stats.min), ''),
      miniStat('Máximo', moneyOrDash(stats.max), ''),
    ));

    if (stats.variation != null) {
      const up = stats.variation > 0;
      priceSection.appendChild(h('div', { class: `notice ${up ? '' : 'notice--ok'} mt-2` },
        h('span', { html: icon(up ? 'trendingUp' : 'trendingDown', { size: 18 }) }),
        h('span.grow', up
          ? `El precio subió ${percent(stats.variation)} respecto a la compra anterior.`
          : `El precio bajó ${percent(Math.abs(stats.variation))} respecto a la compra anterior.`),
      ));
    }

    const series = priceSeries(product.id);
    if (series.length >= 3) {
      priceSection.appendChild(h('div.card.mt-2',
        h('div.card-head', h('h3', 'Evolución del precio'), h('span.muted.small', `${series.length} compras`)),
        sparkline(series),
      ));
    }
  }
  root.appendChild(priceSection);

  /* ---- Comparación entre comercios ---- */
  if (storeRows.length) {
    const table = h('table.table',
      h('thead', h('tr',
        h('th', 'Comercio'),
        h('th', 'Último'),
        h('th', 'Promedio'),
      )),
      h('tbody', ...storeRows.map((row, index) => h('tr', { class: index === 0 && storeRows.length > 1 ? 'is-best' : '' },
        h('td', row.storeName, index === 0 && storeRows.length > 1
          ? h('span.badge.badge--ok', { style: { marginLeft: '6px' } }, 'más barato') : null),
        h('td.num', moneyOrDash(row.last)),
        h('td.num', moneyOrDash(row.avg)),
      ))),
    );
    root.appendChild(h('div.section',
      h('div.section-title', h('span', { html: icon('store', { size: 19 }) }), 'Dónde comprarlo'),
      h('div.card', table,
        storeRows.length > 1 && storeRows[0].avg != null
          ? h('div.notice.notice--ok.mt-2',
            h('span', { html: icon('star', { size: 18 }) }),
            h('span.grow', `Recomendado: ${storeRows[0].storeName} — ${money(storeRows[0].avg)} en promedio.`))
          : null,
      ),
    ));
  }

  /* ---- Historial ---- */
  const historySection = h('div.section',
    h('div.section-title', h('span', { html: icon('receipt', { size: 19 }) }), 'Historial de compras',
      h('span.count', purchases.length ? `${purchases.length}` : '')));
  if (!purchases.length) {
    historySection.appendChild(h('div.card', h('div.muted.small', 'Sin compras registradas.')));
  } else {
    const list = h('div.list');
    purchases.forEach((purchase) => {
      list.appendChild(h('button.tile', {
        type: 'button',
        onclick: () => openPurchaseActions(purchase),
      },
      h('div.thumb', { html: icon('cart', { size: 18 }) }),
      h('div.tile__body',
        h('div.tile__title', purchase.storeName || state.storesById.get(purchase.storeId)?.name || 'Sin comercio'),
        h('div.tile__meta', formatDate(purchase.purchaseDate), ' · ', `${fmtQty(purchase.quantity)} × ${money(purchase.unitPrice)}`),
      ),
      h('div.tile__right', h('div.tile__price', money(purchase.totalPrice))),
      ));
    });
    historySection.appendChild(list);
  }
  root.appendChild(historySection);

  return root;

  function miniStat(label, value, variant) {
    return h('div', { class: `stat ${variant}` },
      h('div.stat__label', label),
      h('div.stat__value', { style: { fontSize: '1.3rem' } }, value));
  }

  function openPurchaseActions(purchase) {
    openSheet({
      title: 'Compra registrada',
      subtitle: `${formatDate(purchase.purchaseDate)} · ${money(purchase.totalPrice)}`,
      dialog: true,
      content: (api) => h('div.menu-list',
        h('button.menu-item', {
          type: 'button',
          onclick: () => { api.close(); openPurchaseForm({ purchase }); },
        },
        h('span.menu-item__icon', { html: icon('pencil', { size: 18 }) }),
        h('div.menu-item__body', h('div.menu-item__title', 'Editar compra'),
          h('div.menu-item__hint', 'No modifica la cantidad del inventario')),
        ),
        h('button.menu-item', {
          type: 'button',
          onclick: async () => {
            api.close();
            const ok = await confirmDialog({
              title: 'Eliminar del historial',
              message: 'Se eliminará este registro y se recalcularán los promedios. El inventario no cambiará.',
            });
            if (!ok) return;
            try {
              await deletePurchase(purchase.id);
              toastOk('Compra eliminada del historial');
            } catch (error) { toastError(error); }
          },
        },
        h('span.menu-item__icon', { style: { color: 'var(--danger)' }, html: icon('trash', { size: 18 }) }),
        h('div.menu-item__body', h('div.menu-item__title', 'Eliminar del historial')),
        ),
      ),
    });
  }

  async function removeProduct() {
    const ok = await confirmDialog({
      title: `¿Eliminar «${product.name}»?`,
      message: 'El producto saldrá del inventario y de la lista de compras.',
      detail: 'Su historial de compras se conserva para no perder las estadísticas de gasto.',
    });
    if (!ok) return;
    try {
      await deleteProduct(product.id);
      toastOk('Producto eliminado');
      ctx.go('/inventario');
    } catch (error) {
      toastError(error);
    }
  }
}
