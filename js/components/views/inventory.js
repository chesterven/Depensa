/** Inventario: búsqueda, filtros y control rápido de cantidades. */
import { h, debounce, haptic } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';
import { money, qty as fmtQty, initials } from '../../utils/format.js';
import { formatRelative } from '../../utils/date.js';
import { state } from '../../state.js';
import { getPhoto } from '../../database/photos.js';
import { getPref, setPref } from '../../database/settings.js';
import { filterProducts, statusOf, STATUS, STATUS_LABEL, adjustQuantity, inventorySummary } from '../../services/inventory-service.js';
import { emptyState } from '../ui/empty.js';
import { chipRow, segmented } from '../ui/form.js';
import { openProductForm } from '../product-form.js';
import { toastError } from '../ui/toast.js';

const STATUS_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'available', label: 'Disponibles' },
  { value: 'low', label: 'Por comprar' },
  { value: 'out', label: 'Agotados' },
  { value: 'never', label: 'Nunca comprados' },
];

const defaults = { query: '', categoryId: '', status: 'all', sort: 'name' };
let filters = { ...defaults, ...(getPref('filters.inventory') || {}) };

export function render(ctx) {
  if (ctx.query.status) filters.status = ctx.query.status;
  if (ctx.query.category) filters.categoryId = ctx.query.category;

  const summary = inventorySummary(state.products);
  ctx.setHeader({
    title: 'Inventario',
    subtitle: `${summary.total} productos · ${summary.out} agotados`,
    actions: [{ iconName: 'plus', label: 'Nuevo producto', onClick: () => openProductForm() }],
  });
  ctx.onState(() => ctx.refresh());

  const root = h('div');

  /* ---- Búsqueda ---- */
  const searchInput = h('input.input', {
    type: 'search',
    value: filters.query,
    placeholder: 'Buscar producto…',
    'aria-label': 'Buscar producto',
    'data-keep-focus': 'search',
    autocomplete: 'off',
    oninput: debounce((event) => {
      filters.query = event.target.value;
      persist();
      ctx.refresh();
    }, 200),
  });

  root.appendChild(h('div.search',
    h('span.icon-left', { html: icon('search', { size: 19 }) }),
    searchInput,
    filters.query ? h('button.btn-icon.clear', {
      type: 'button', 'aria-label': 'Limpiar búsqueda',
      html: icon('close', { size: 18 }),
      onclick: () => { filters.query = ''; persist(); ctx.refresh(); },
    }) : null,
  ));

  /* ---- Filtros ---- */
  const categoryOptions = [
    { value: '', label: 'Todas' },
    ...state.categories.map((category) => ({
      value: category.id,
      label: category.name,
      count: state.products.filter((p) => p.categoryId === category.id).length,
    })),
  ];

  root.appendChild(h('div', { style: { marginTop: '10px' } },
    chipRow(STATUS_FILTERS.map((option) => ({ ...option, count: countFor(option.value) })), filters.status, (value) => {
      filters.status = value; persist(); ctx.refresh();
    }),
  ));
  root.appendChild(chipRow(categoryOptions, filters.categoryId, (value) => {
    filters.categoryId = filters.categoryId === value ? '' : value;
    persist();
    ctx.refresh();
  }));

  /* ---- Orden ---- */
  root.appendChild(h('div', { style: { marginTop: '6px', marginBottom: '12px' } },
    segmented([
      { value: 'name', label: 'A-Z' },
      { value: 'status', label: 'Estado' },
      { value: 'recent', label: 'Recientes' },
      { value: 'price', label: 'Precio' },
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
  } else {
    const list = h('div.list');
    results.forEach((product) => list.appendChild(productTile(product, ctx)));
    root.appendChild(list);
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
    return filterProducts(state.products, { ...filters, query: '', status: value }).length;
  }
}

function persist() {
  setPref('filters.inventory', filters);
}

/** Tarjeta de producto con control de cantidad. */
export function productTile(product, ctx) {
  const status = statusOf(product);
  const statusKey = status === STATUS.OK ? 'ok' : status === STATUS.LOW ? 'low' : 'out';
  const thumb = h('div', { class: `thumb thumb--${statusKey}` }, initials(product.name));

  if (product.hasPhoto) {
    getPhoto(product.id).then((photo) => {
      if (photo?.dataUrl) thumb.replaceChildren(h('img', { src: photo.dataUrl, alt: '', loading: 'lazy' }));
    }).catch(() => {});
  }

  const value = h('span.stepper__value', { 'aria-live': 'polite' }, fmtQty(product.currentQuantity));

  const step = async (delta) => {
    haptic();
    try {
      await adjustQuantity(product.id, delta);
    } catch (error) {
      toastError(error, 'No se pudo actualizar la cantidad.');
    }
  };

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
      h('div.tile__title', product.name,
        h('span', { class: `badge badge--${statusKey}` }, STATUS_LABEL[status])),
      h('div.tile__meta',
        state.categoriesById.get(product.categoryId)?.name || 'Sin categoría',
        product.avgPrice != null ? h('span', ` · prom. ${money(product.avgPrice)}`) : null,
        product.lastPurchaseDate ? h('span', ` · ${formatRelative(product.lastPurchaseDate)}`) : null,
      ),
    )),
    h('div.stepper',
      h('button', {
        type: 'button', 'aria-label': `Quitar uno de ${product.name}`,
        disabled: Number(product.currentQuantity) <= 0,
        html: icon('minus', { size: 18 }),
        onclick: () => step(-1),
      }),
      value,
      h('button', {
        type: 'button', 'aria-label': `Agregar uno de ${product.name}`,
        html: icon('plus', { size: 18 }),
        onclick: () => step(1),
      }),
    ),
  );
}
