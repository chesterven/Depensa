/** Inicio: resumen del estado del hogar. */
import { h } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';
import { money, qty as fmtQty, plural } from '../../utils/format.js';
import { formatRelative, formatDateShort } from '../../utils/date.js';
import { state, pendingItems } from '../../state.js';
import { inventorySummary, statusOf, STATUS, recentProducts } from '../../services/inventory-service.js';
import { expenseSummary, monthComparison } from '../../services/stats-service.js';
import { recentPurchases } from '../../services/purchase-service.js';
import { listTotals } from '../../services/shopping-service.js';
import { emptyState } from '../ui/empty.js';
import { openPurchaseForm } from '../purchase-form.js';
import { openProductForm } from '../product-form.js';
import { loadDemoData } from '../../services/demo-data.js';
import { toastError, toastOk } from '../ui/toast.js';

export function render(ctx) {
  ctx.setHeader({
    title: state.settings?.householdName || 'Mi hogar',
    subtitle: 'Resumen de tu despensa',
    actions: [
      { iconName: 'plus', label: 'Registrar compra', onClick: () => openPurchaseForm({}) },
    ],
  });
  ctx.onState(() => ctx.refresh());

  const root = h('div');
  const products = state.products;
  const summary = inventorySummary(products);
  const expenses = expenseSummary();
  const comparison = monthComparison();
  const pending = pendingItems();
  const totals = listTotals(pending);

  if (!products.length && !state.purchases.length) {
    root.appendChild(h('div.card', emptyState({
      iconName: 'jar',
      title: 'Tu despensa está vacía',
      text: 'Agrega tu primer producto o carga datos de ejemplo para ver cómo funciona la aplicación.',
      actionLabel: 'Agregar producto',
      onAction: async () => { await openProductForm(); },
      secondaryLabel: 'Cargar datos de demostración',
      onSecondary: async () => {
        try {
          const result = await loadDemoData();
          toastOk(`Se cargaron ${result.products} productos de ejemplo`);
        } catch (error) { toastError(error); }
      },
    })));
    return root;
  }

  /* ---- Gasto del mes ---- */
  const trend = comparison.change;
  root.appendChild(h('div.hero',
    h('div.hero__label', 'Gasto de este mes'),
    h('div.hero__value', money(expenses.month)),
    h('div.hero__meta',
      h('span.hero__chip',
        h('span', { html: icon(trend != null && trend > 0 ? 'trendingUp' : 'trendingDown', { size: 16 }) }),
        trend == null ? 'Sin comparación' : `${trend > 0 ? '+' : ''}${trend}% vs. mes anterior`),
      h('span.hero__chip', h('span', { html: icon('chart', { size: 16 }) }), `Promedio ${money(expenses.monthlyAverage)}`),
      h('span.hero__chip', h('span', { html: icon('receipt', { size: 16 }) }), plural(expenses.count, 'compra')),
    ),
  ));

  /* ---- Tarjetas de resumen ---- */
  root.appendChild(h('div.stat-grid.mt-2',
    statCard({ label: 'En inventario', value: summary.total, hint: `${summary.available} disponibles`, iconName: 'box', onClick: () => ctx.go('/inventario') }),
    statCard({ label: 'Agotados', value: summary.out, hint: 'Sin existencias', iconName: 'alert', variant: summary.out ? 'stat--danger' : '', onClick: () => ctx.go('/inventario?status=out') }),
    statCard({ label: 'Por comprar', value: summary.low, hint: 'Bajo el mínimo', iconName: 'trendingDown', variant: summary.low ? 'stat--warn' : '', onClick: () => ctx.go('/inventario?status=low') }),
    statCard({ label: 'En la lista', value: pending.length, hint: totals.total ? `≈ ${money(totals.total)}` : 'Sin pendientes', iconName: 'list', onClick: () => ctx.go('/lista') }),
  ));

  /* ---- Lista rápida de compras ---- */
  const quickSection = h('div.section');
  quickSection.appendChild(h('div.section-title',
    h('span', { html: icon('list', { size: 19 }) }), 'Lista de compras',
    h('span.count', pending.length ? `${pending.length}` : ''),
    h('span.spacer'),
    pending.length ? h('button.card-link', { type: 'button', onclick: () => ctx.go('/lista') }, 'Ver todo') : null,
  ));

  if (!pending.length) {
    quickSection.appendChild(h('div.card', h('div.row', { style: { gap: '12px' } },
      h('div.thumb.thumb--ok', { html: icon('check', { size: 20 }) }),
      h('div.grow', h('div', { style: { fontWeight: 600 } }, 'No falta nada'),
        h('div.muted.small', 'Cuando un producto se agote aparecerá aquí automáticamente.')),
    )));
  } else {
    const list = h('div.list');
    pending.slice(0, 5).forEach((item) => {
      const product = state.productsById.get(item.productId);
      const estimated = item.estimatedPrice != null ? Number(item.estimatedPrice) * Number(item.quantity || 1) : null;
      list.appendChild(h('div.tile',
        h('button.btn-icon', {
          type: 'button',
          'aria-label': `Marcar ${item.name} como comprado`,
          style: { background: 'var(--pine-soft)', color: 'var(--pine)' },
          html: icon('check', { size: 20 }),
          onclick: () => openPurchaseForm({
            productId: item.productId,
            shoppingItemId: item.id,
            quantity: item.quantity,
            storeId: item.storeId,
            unitPrice: item.estimatedPrice,
          }),
        }),
        h('div.tile__body',
          h('div.tile__title', item.name),
          h('div.tile__meta',
            `${fmtQty(item.quantity)} ${product?.unit || ''}`.trim(),
            item.storeId ? h('span', ' · ', state.storesById.get(item.storeId)?.name || '') : null,
          ),
        ),
        estimated != null ? h('div.tile__right', h('div.tile__price', money(estimated))) : null,
      ));
    });
    if (pending.length > 5) {
      list.appendChild(h('button.btn.btn-soft.btn-block', { type: 'button', onclick: () => ctx.go('/lista') },
        `Ver ${pending.length - 5} más`));
    }
    quickSection.appendChild(list);
  }
  root.appendChild(quickSection);

  /* ---- Agregados recientemente ---- */
  const recents = recentProducts(6);
  if (recents.length) {
    const section = h('div.section',
      h('div.section-title', h('span', { html: icon('sparkles', { size: 19 }) }), 'Agregados recientemente'),
    );
    const row = h('div.chip-row');
    recents.forEach((product) => {
      const status = statusOf(product);
      row.appendChild(h('button.chip', {
        type: 'button',
        onclick: () => ctx.go(`/producto/${product.id}`),
      },
      h('span', { class: `dot dot--${status === STATUS.OK ? 'ok' : status === STATUS.LOW ? 'low' : 'out'}` }),
      product.name));
    });
    section.appendChild(row);
    root.appendChild(section);
  }

  /* ---- Últimas compras ---- */
  const purchases = recentPurchases(5);
  const purchaseSection = h('div.section',
    h('div.section-title', h('span', { html: icon('receipt', { size: 19 }) }), 'Últimas compras',
      h('span.spacer'),
      state.purchases.length ? h('button.card-link', { type: 'button', onclick: () => ctx.go('/compras') }, 'Historial') : null),
  );
  if (!purchases.length) {
    purchaseSection.appendChild(h('div.card', h('div.muted.small', 'Aún no has registrado compras.')));
  } else {
    const list = h('div.list');
    purchases.forEach((purchase) => {
      list.appendChild(h('button.tile', {
        type: 'button',
        onclick: () => purchase.productId ? ctx.go(`/producto/${purchase.productId}`) : ctx.go('/compras'),
      },
      h('div.thumb', { html: icon('cart', { size: 19 }) }),
      h('div.tile__body',
        h('div.tile__title', purchase.productName || 'Producto'),
        h('div.tile__meta',
          purchase.storeName || state.storesById.get(purchase.storeId)?.name || 'Sin comercio',
          ' · ', formatDateShort(purchase.purchaseDate)),
      ),
      h('div.tile__right',
        h('div.tile__price', money(purchase.totalPrice)),
        h('div.muted.small', `${fmtQty(purchase.quantity)} × ${money(purchase.unitPrice)}`)),
      ));
    });
    purchaseSection.appendChild(list);
  }
  root.appendChild(purchaseSection);

  return root;
}

function statCard({ label, value, hint, iconName, variant = '', onClick }) {
  return h('button', { class: `stat ${variant}`, type: 'button', onclick: onClick },
    h('span.stat__icon', { html: icon(iconName, { size: 18 }) }),
    h('div.stat__label', label),
    h('div.stat__value', String(value)),
    hint ? h('div.stat__hint', hint) : null,
  );
}

export { formatRelative };
