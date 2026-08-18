/** Historial de compras con filtros, orden y totales. */
import { h, debounce } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';
import { money, qty as fmtQty, plural } from '../../utils/format.js';
import { formatDate, formatRelative } from '../../utils/date.js';
import { state } from '../../state.js';
import { getPref, setPref } from '../../database/settings.js';
import { filterPurchases, sortPurchases, groupByDate, deletePurchase } from '../../services/purchase-service.js';
import { total as sumTotal } from '../../services/stats-service.js';
import { emptyState } from '../ui/empty.js';
import { field, select, input, segmented } from '../ui/form.js';
import { openSheet } from '../ui/sheet.js';
import { confirmDialog } from '../ui/confirm.js';
import { toastOk, toastError } from '../ui/toast.js';
import { openPurchaseForm } from '../purchase-form.js';

const defaults = { query: '', productId: '', categoryId: '', storeId: '', from: '', to: '', sort: 'date-desc' };
let filters = { ...defaults, ...(getPref('filters.purchases') || {}) };

export function render(ctx) {
  const filtered = sortPurchases(filterPurchases(state.purchases, filters), filters.sort);
  const rangeTotal = sumTotal(filtered);
  const activeFilters = countActive();

  ctx.setHeader({
    title: 'Compras',
    subtitle: state.purchases.length ? `${filtered.length} registros · ${money(rangeTotal)}` : 'Historial vacío',
    actions: [
      { iconName: 'filter', label: 'Filtrar', onClick: () => openFilters(), badge: activeFilters || null },
      { iconName: 'plus', label: 'Registrar compra', onClick: () => openPurchaseForm({}) },
    ],
  });
  ctx.onState(() => ctx.refresh());

  const root = h('div');

  if (!state.purchases.length) {
    root.appendChild(emptyState({
      iconName: 'receipt',
      title: 'Sin compras registradas',
      text: 'Cada vez que marques un producto como comprado se guardará aquí con su precio y comercio.',
      actionLabel: 'Registrar compra',
      onAction: () => openPurchaseForm({}),
    }));
    return root;
  }

  root.appendChild(h('div.search',
    h('span.icon-left', { html: icon('search', { size: 19 }) }),
    h('input.input', {
      type: 'search',
      value: filters.query,
      placeholder: 'Buscar producto o comercio…',
      'aria-label': 'Buscar en el historial',
      'data-keep-focus': 'search-purchases',
      oninput: debounce((event) => { filters.query = event.target.value; persist(); ctx.refresh(); }, 200),
    }),
  ));

  if (activeFilters) {
    root.appendChild(h('div.row.row--wrap.mt-1', { style: { gap: '6px' } },
      ...describeFilters().map((text) => h('span.chip.is-active', text)),
      h('button.chip', { type: 'button', onclick: () => { filters = { ...defaults, query: filters.query }; persist(); ctx.refresh(); } },
        h('span', { html: icon('close', { size: 14 }) }), 'Quitar filtros'),
    ));
  }

  root.appendChild(h('div.card.mt-2',
    h('div.row.row--between',
      h('div',
        h('div.muted.small', 'Total del período mostrado'),
        h('div.display', { style: { fontSize: '1.55rem' } }, money(rangeTotal)),
        h('div.muted.small', plural(filtered.length, 'compra')),
      ),
      h('span.thumb', { html: icon('receipt', { size: 20 }) }),
    ),
  ));

  if (!filtered.length) {
    root.appendChild(emptyState({
      iconName: 'search',
      title: 'Sin resultados',
      text: 'Ajusta los filtros o el rango de fechas.',
      actionLabel: 'Quitar filtros',
      onAction: () => { filters = { ...defaults }; persist(); ctx.refresh(); },
    }));
    return root;
  }

  if (filters.sort === 'date-desc' || filters.sort === 'date-asc') {
    groupByDate(filtered).forEach((group) => {
      root.appendChild(h('div.section',
        h('div.section-title',
          h('span', { html: icon('calendar', { size: 17 }) }),
          formatDate(group.date),
          h('span.spacer'),
          h('span.count', money(group.total)),
        ),
        h('div.list', ...group.items.map(purchaseTile)),
      ));
    });
  } else {
    root.appendChild(h('div.list.mt-2', ...filtered.map(purchaseTile)));
  }

  return root;

  function purchaseTile(purchase) {
    return h('button.tile', { type: 'button', onclick: () => openActions(purchase) },
      h('div.thumb', { html: icon('cart', { size: 18 }) }),
      h('div.tile__body',
        h('div.tile__title', purchase.productName || state.productsById.get(purchase.productId)?.name || 'Producto'),
        h('div.tile__meta',
          purchase.storeName || state.storesById.get(purchase.storeId)?.name || 'Sin comercio',
          ' · ', formatRelative(purchase.purchaseDate),
        ),
      ),
      h('div.tile__right',
        h('div.tile__price', money(purchase.totalPrice)),
        h('div.muted.small', `${fmtQty(purchase.quantity)} × ${money(purchase.unitPrice)}`),
      ),
    );
  }

  function openActions(purchase) {
    openSheet({
      title: purchase.productName || 'Compra',
      subtitle: `${formatDate(purchase.purchaseDate)} · ${money(purchase.totalPrice)}`,
      dialog: true,
      content: (api) => h('div.menu-list',
        purchase.productId ? menuItem('box', 'Ver producto', 'Precios, comercios e historial', () => {
          api.close(); ctx.go(`/producto/${purchase.productId}`);
        }) : null,
        menuItem('pencil', 'Editar compra', 'Corrige cantidad, precio o comercio', () => {
          api.close(); openPurchaseForm({ purchase });
        }),
        menuItem('trash', 'Eliminar del historial', 'Se recalculan los promedios', async () => {
          api.close();
          const ok = await confirmDialog({
            title: 'Eliminar compra',
            message: 'Este registro dejará de contar en tus estadísticas. El inventario no cambiará.',
          });
          if (!ok) return;
          try {
            await deletePurchase(purchase.id);
            toastOk('Compra eliminada');
          } catch (error) { toastError(error); }
        }, true),
      ),
    });
  }

  function menuItem(iconName, title, hint, onClick, danger = false) {
    return h('button.menu-item', { type: 'button', onclick: onClick },
      h('span.menu-item__icon', { style: danger ? { color: 'var(--danger)' } : null, html: icon(iconName, { size: 18 }) }),
      h('div.menu-item__body', h('div.menu-item__title', title), hint ? h('div.menu-item__hint', hint) : null),
      h('span.chevron', { html: icon('chevronRight', { size: 18 }) }),
    );
  }

  function openFilters() {
    const draft = { ...filters };
    openSheet({
      title: 'Filtrar historial',
      content: h('div',
        h('div.field',
          h('label.field__label', 'Ordenar por'),
          segmented([
            { value: 'date-desc', label: 'Fecha' },
            { value: 'product', label: 'Producto' },
            { value: 'store', label: 'Comercio' },
            { value: 'price-desc', label: 'Precio' },
          ], draft.sort === 'date-asc' ? 'date-desc' : draft.sort, (value) => { draft.sort = value; }),
        ),
        h('div.form-row',
          field('Desde', input({ type: 'date', value: draft.from, onchange: (e) => { draft.from = e.target.value; } })),
          field('Hasta', input({ type: 'date', value: draft.to, onchange: (e) => { draft.to = e.target.value; } })),
        ),
        field('Producto', select(
          [{ value: '', label: 'Todos' }, ...[...state.products].sort((a, b) => a.name.localeCompare(b.name, 'es')).map((p) => ({ value: p.id, label: p.name }))],
          draft.productId, { onchange: (e) => { draft.productId = e.target.value; } },
        )),
        field('Categoría', select(
          [{ value: '', label: 'Todas' }, ...state.categories.map((c) => ({ value: c.id, label: c.name }))],
          draft.categoryId, { onchange: (e) => { draft.categoryId = e.target.value; } },
        )),
        field('Comercio', select(
          [{ value: '', label: 'Todos' }, ...state.stores.map((s) => ({ value: s.id, label: s.name }))],
          draft.storeId, { onchange: (e) => { draft.storeId = e.target.value; } },
        )),
      ),
      actions: [
        { label: 'Limpiar', variant: 'btn-soft', onClick: () => { filters = { ...defaults }; persist(); ctx.refresh(); } },
        { label: 'Aplicar', variant: 'btn-primary', onClick: () => { filters = { ...draft }; persist(); ctx.refresh(); } },
      ],
    });
  }

  function countActive() {
    return ['productId', 'categoryId', 'storeId', 'from', 'to'].filter((key) => filters[key]).length;
  }

  function describeFilters() {
    const labels = [];
    if (filters.productId) labels.push(state.productsById.get(filters.productId)?.name || 'Producto');
    if (filters.categoryId) labels.push(state.categoriesById.get(filters.categoryId)?.name || 'Categoría');
    if (filters.storeId) labels.push(state.storesById.get(filters.storeId)?.name || 'Comercio');
    if (filters.from) labels.push(`desde ${formatDate(filters.from)}`);
    if (filters.to) labels.push(`hasta ${formatDate(filters.to)}`);
    return labels;
  }
}

function persist() {
  setPref('filters.purchases', filters);
}
