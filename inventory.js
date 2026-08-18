/** Inventario: búsqueda, filtros y control de existencias con un toque. */
import { h, debounce, haptic } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';
import { money, initials } from '../../utils/format.js';
import { formatRelative } from '../../utils/date.js';
import { state, isInList } from '../../state.js';
import { getPhoto } from '../../database/photos.js';
import { getPref, setPref } from '../../database/settings.js';
import { filterProducts, isOut, markAsOut, markAsPurchased, restoreProductState, snapshotProduct, inventorySummary, groupByStore } from '../../services/inventory-service.js';
import { emptyState } from '../ui/empty.js';
import { chipRow, segmented } from '../ui/form.js';
import { openProductForm } from '../product-form.js';
import { toast, toastError } from '../ui/toast.js';

const STATUS_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'available', label: 'Con existencia' },
  { value: 'out', label: 'Agotados' },
];

const defaults = { query: '', categoryId: '', status: 'all', sort: 'name' };
let filters = { ...defaults, ...(getPref('filters.inventory') || {}) };

export function render(ctx) {
  if (ctx.query.status) filters.status = ctx.query.status;
  if (ctx.query.category) filters.categoryId = ctx.query.category;
  if (ctx.query.store) { filters.storeId = ctx.query.store; filters.sort = 'store'; }

  const summary = inventorySummary(state.products);
  ctx.setHeader({
    title: 'Inventario',
    subtitle: `${summary.total} productos · ${summary.out} agotados`,
    actions: [{ iconName: 'plus', label: 'Nuevo producto', onClick: () => openProductForm() }],
  });
  ctx.onState(() => ctx.refresh());

  const root = h('div');

  /* ---- Búsqueda ---- */
  root.appendChild(h('div.search',
    h('span.icon-left', { html: icon('search', { size: 19 }) }),
    h('input.input', {
      type: 'search',
      value: filters.query,
      placeholder: 'Buscar producto…',
      'aria-label': 'Buscar producto',
      'data-keep-focus': 'search',
      autocomplete: 'off',
      oninput: debounce((event) => { filters.query = event.target.value; persist(); ctx.refresh(); }, 200),
    }),
    filters.query ? h('button.btn-icon.clear', {
      type: 'button', 'aria-label': 'Limpiar búsqueda',
      html: icon('close', { size: 18 }),
      onclick: () => { filters.query = ''; persist(); ctx.refresh(); },
    }) : null,
  ));

  /* ---- Filtros ---- */
  root.appendChild(h('div', { style: { marginTop: '10px' } },
    chipRow(STATUS_FILTERS.map((option) => ({ ...option, count: countFor(option.value) })), filters.status, (value) => {
      filters.status = value; persist(); ctx.refresh();
    }),
  ));

  const categoryOptions = [
    { value: '', label: 'Todas' },
    ...state.categories
      .map((category) => ({
        value: category.id,
        label: category.name,
        count: state.products.filter((p) => p.categoryId === category.id).length,
      }))
      .filter((option) => option.count > 0 || option.value === filters.categoryId),
  ];
  if (categoryOptions.length > 1) {
    root.appendChild(chipRow(categoryOptions, filters.categoryId, (value) => {
      filters.categoryId = filters.categoryId === value ? '' : value;
      persist();
      ctx.refresh();
    }));
  }

  root.appendChild(h('div', { style: { marginTop: '6px', marginBottom: '12px' } },
    segmented([
      { value: 'name', label: 'A-Z' },
      { value: 'status', label: 'Estado' },
      { value: 'store', label: 'Comercio' },
      { value: 'recent', label: 'Recientes' },
    ], filters.sort, (value) => { filters.sort = value; persist(); ctx.refresh(); }),
  ));

  /* ---- Resultados ---- */
  const results = filterProducts(state.products, filters);
  if (!results.length) {
    root.appendChild(state.products.length
      ? emptyState({
        iconName: 'search',
        title: 'Sin resultados',
        text: 'Prueba con otro nombre o quita los filtros aplicados.',
        actionLabel: 'Quitar filtros',
        onAction: () => { filters = { ...defaults }; persist(); ctx.refresh(); },
      })
      : emptyState({
        iconName: 'box',
        title: 'Todavía no hay productos',
        text: 'Agrega los productos que sueles tener en casa para llevar el control.',
        actionLabel: 'Agregar producto',
        onAction: () => openProductForm(),
      }));
  } else if (filters.sort === 'store') {
    groupByStore(results).forEach((group) => {
      root.appendChild(h('div.section', { style: { marginTop: '14px' } },
        h('div.section-title',
          h('span', { html: icon('store', { size: 18 }) }),
          group.storeName,
          h('span.spacer'),
          h('span.count', String(group.products.length)),
        ),
        h('div.list', ...group.products.map((product) => productTile(product, ctx))),
      ));
    });
  } else {
    root.appendChild(h('div.list', ...results.map((product) => productTile(product, ctx))));
    root.appendChild(h('div.muted.small.text-center', { style: { padding: '18px 0 0' } },
      `${results.length} de ${state.products.length} productos`));
  }

  root.appendChild(h('button.fab', {
    type: 'button',
    onclick: () => openProductForm(),
    'aria-label': 'Agregar producto',
  }, h('span', { html: icon('plus', { size: 21 }) }), 'Producto'));

  return root;

  function countFor(value) {
    if (value === 'all') return state.products.length;
    return filterProducts(state.products, { ...filters, query: '', categoryId: '', status: value }).length;
  }
}

function persist() {
  setPref('filters.inventory', filters);
}

/** Tarjeta de producto con el interruptor de existencia. */
export function productTile(product, ctx) {
  const out = isOut(product);
  const thumb = h('div', { class: `thumb thumb--${out ? 'out' : 'ok'}` }, initials(product.name));

  if (product.hasPhoto) {
    getPhoto(product.id).then((photo) => {
      if (photo?.dataUrl) thumb.replaceChildren(h('img', { src: photo.dataUrl, alt: '', loading: 'lazy' }));
    }).catch(() => {});
  }

  const meta = [
    state.storesById.get(product.storeId)?.name || 'Sin comercio',
    product.unit || null,
    product.referencePrice != null ? money(product.referencePrice) : null,
  ].filter(Boolean).join(' · ');

  return h('div.tile',
    h('button', {
      type: 'button',
      class: 'row grow',
      style: { background: 'transparent', border: 0, padding: 0, gap: '12px', textAlign: 'left' },
      onclick: () => ctx.go(`/producto/${product.id}`),
      'aria-label': `Ver ${product.name}`,
    },
    thumb,
    h('div.tile__body',
      h('div.tile__title', h('span.truncate', product.name),
        out ? h('span.badge.badge--out', 'Agotado') : null),
      h('div.tile__meta', meta),
    )),
    out
      ? h('button.btn.btn-sm', {
        type: 'button',
        style: { background: 'var(--pine-soft)', color: 'var(--pine-ink)', flex: 'none' },
        'aria-label': `Marcar ${product.name} como comprado`,
        onclick: () => setStatus(product, false),
      }, h('span', { html: icon('check', { size: 16 }) }), 'Comprado')
      : h('button.btn.btn-sm.btn-soft', {
        type: 'button',
        style: { flex: 'none' },
        'aria-label': `Marcar ${product.name} como agotado`,
        onclick: () => setStatus(product, true),
      }, h('span', { html: icon('cart', { size: 16 }) }), 'Se agotó'),
  );
}

async function setStatus(product, out) {
  haptic();
  const previous = snapshotProduct(product);
  try {
    if (out) {
      await markAsOut(product.id);
      toast(`«${product.name}» pasó a la lista de compras`, {
        type: 'warn',
        action: { label: 'Deshacer', onClick: () => restoreProductState(previous).catch(toastError) },
      });
    } else {
      await markAsPurchased(product.id);
      toast(`«${product.name}» vuelve a estar disponible`, {
        type: 'ok',
        action: { label: 'Deshacer', onClick: () => restoreProductState(previous).catch(toastError) },
      });
    }
  } catch (error) {
    toastError(error, 'No se pudo actualizar el producto.');
  }
}

export { isInList, formatRelative };
