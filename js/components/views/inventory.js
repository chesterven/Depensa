/** Inventario: buscar, filtrar y marcar existencia. */
import { h, debounce } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';
import { state } from '../../state.js';
import { getPref, setPref } from '../../utils/prefs.js';
import { filterProducts, FILTERS, summary, groupByCategory } from '../../services/inventory.js';
import { emptyState } from '../ui/empty.js';
import { chipRow } from '../ui/form.js';
import { productCard, productRow } from '../product-card.js';
import { openProductForm } from '../product-form.js';
import { openSheet } from '../ui/sheet.js';

const defaults = { query: '', categoryId: '', status: 'all', sort: 'name' };
let filters = { ...defaults, ...(getPref('filters.inventory') || {}) };
let view = getPref('ui.inventoryView', 'grid');

export function render(ctx) {
  if (ctx.query.status) filters.status = ctx.query.status;
  if (ctx.query.category !== undefined) filters.categoryId = ctx.query.category;

  const stats = summary(state.products);
  ctx.setHeader({
    title: 'Inventario',
    subtitle: `${stats.total} productos · faltan ${stats.out}`,
    actions: [
      {
        iconName: view === 'grid' ? 'list' : 'grid',
        label: view === 'grid' ? 'Ver como lista' : 'Ver como galería',
        onClick: () => { view = view === 'grid' ? 'row' : 'grid'; setPref('ui.inventoryView', view); ctx.refresh(); },
      },
      { iconName: 'sliders', label: 'Ordenar', onClick: () => openSort() },
      { iconName: 'plus', label: 'Nuevo producto', onClick: () => openProductForm() },
    ],
  });
  ctx.onState(() => ctx.refresh());

  const root = h('div');

  root.appendChild(h('div.search',
    h('span.icon-left', { html: icon('search', { size: 19 }) }),
    h('input.input', {
      type: 'search',
      value: filters.query,
      placeholder: 'Buscar en la despensa…',
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

  root.appendChild(h('div', { style: { marginTop: '10px' } },
    chipRow(FILTERS.map((option) => ({ ...option, count: countFor(option.value) })), filters.status, (value) => {
      filters.status = value; persist(); ctx.refresh();
    })));

  const categoryOptions = [
    { value: '', label: 'Todas' },
    ...state.categories
      .map((category) => ({
        value: category.id,
        label: category.name,
        icon: category.icon,
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

  const results = filterProducts(state.products, filters);

  if (!results.length) {
    root.appendChild(h('div.mt-2', state.products.length
      ? emptyState({
        iconName: 'search',
        title: 'Sin resultados',
        text: 'Prueba con otro nombre o quita los filtros.',
        actionLabel: 'Quitar filtros',
        onAction: () => { filters = { ...defaults }; persist(); ctx.refresh(); },
      })
      : emptyState({
        iconName: 'box',
        title: 'Todavía no hay productos',
        text: 'Agrega lo que tienes en casa para llevar el control.',
        actionLabel: 'Agregar producto',
        onAction: () => openProductForm(),
      })));
  } else if (filters.sort === 'category') {
    groupByCategory(results).forEach((group) => {
      root.appendChild(h('div.section', { style: { marginTop: '16px' } },
        h('div.section-title',
          h('span', { style: { color: group.color }, html: icon(group.icon, { size: 18 }) }),
          group.name,
          h('span.spacer'),
          h('span.count', String(group.products.length))),
        renderCollection(group.products),
      ));
    });
  } else {
    root.appendChild(h('div', { style: { marginTop: '14px' } }, renderCollection(results)));
    root.appendChild(h('div.muted.small.text-center', { style: { padding: '18px 0 0' } },
      `${results.length} de ${state.products.length} productos`));
  }

  root.appendChild(h('button.fab', {
    type: 'button', onclick: () => openProductForm(), 'aria-label': 'Agregar producto',
  }, h('span', { html: icon('plus', { size: 21 }) }), 'Producto'));

  return root;

  function renderCollection(items) {
    return view === 'grid'
      ? h('div.product-grid', ...items.map((product) => productCard(product, ctx)))
      : h('div.list', ...items.map((product) => productRow(product, ctx, { showStore: true })));
  }

  function countFor(value) {
    return filterProducts(state.products, { ...filters, query: '', categoryId: '', status: value }).length;
  }

  function openSort() {
    const options = [
      { value: 'name', label: 'Nombre (A-Z)', hint: 'Orden alfabético' },
      { value: 'status', label: 'Lo que falta primero', hint: 'Primero lo que no hay' },
      { value: 'expiry', label: 'Próximos a vencer', hint: 'Primero las fechas más cercanas' },
      { value: 'category', label: 'Agrupado por categoría', hint: 'Alimentos, medicina, aseo…' },
      { value: 'recent', label: 'Modificados recientemente', hint: 'Lo último que tocaste' },
    ];
    openSheet({
      title: 'Ordenar inventario',
      dialog: true,
      content: (api) => h('div.menu-list', ...options.map((option) => h('button.menu-item', {
        type: 'button',
        onclick: () => { filters.sort = option.value; persist(); api.close(); ctx.refresh(); },
      },
      h('span.menu-item__icon', { html: icon(filters.sort === option.value ? 'checkCircle' : 'chevronRight', { size: 18 }) }),
      h('div.menu-item__body',
        h('div.menu-item__title', option.label),
        h('div.menu-item__hint', option.hint))))),
    });
  }
}

function persist() {
  setPref('filters.inventory', filters);
}
