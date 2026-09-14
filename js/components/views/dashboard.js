/** Inicio: qué hay, qué falta y qué está por vencer. */
import { h } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';
import { plural } from '../../utils/format.js';
import { formatRelative } from '../../utils/date.js';
import { state } from '../../state.js';
import { summary, shoppingList, expiringSoon, groupByCategory } from '../../services/inventory.js';
import { toggleStock } from '../../services/actions.js';
import { emptyState } from '../ui/empty.js';
import { productRow } from '../product-card.js';
import { openProductForm } from '../product-form.js';
import { loadDemo } from '../../services/demo-data.js';
import { toastOk, toastError } from '../ui/toast.js';

export function render(ctx) {
  ctx.setHeader({
    title: state.household?.name || 'Mi hogar',
    subtitle: 'Lo que hay en casa',
    actions: [{ iconName: 'plus', label: 'Nuevo producto', onClick: () => openProductForm() }],
  });
  ctx.onState(() => ctx.refresh());

  const root = h('div');
  const products = state.products;
  const stats = summary(products);
  const missing = shoppingList(products);
  const expiring = expiringSoon(products);

  if (!products.length) {
    root.appendChild(h('div.card', emptyState({
      iconName: 'jar',
      title: 'Empieza tu despensa',
      text: 'Registra lo que tienes en casa. Con una foto y un toque sabrás siempre si hay o no hay.',
      actionLabel: 'Agregar producto',
      onAction: () => openProductForm(),
      secondaryLabel: 'Cargar ejemplo',
      onSecondary: async () => {
        try {
          const result = await loadDemo();
          toastOk(`Se agregaron ${result.products} productos de ejemplo`);
        } catch (error) { toastError(error); }
      },
    })));
    return root;
  }

  /* ---- Resumen ---- */
  root.appendChild(h('div.hero',
    h('div.hero__label', 'Falta en casa'),
    h('div.hero__value', String(stats.out)),
    h('div.hero__meta',
      h('span.hero__chip', h('span', { html: icon('checkCircle', { size: 16 }) }), `${stats.inStock} en existencia`),
      stats.soon ? h('span.hero__chip', h('span', { html: icon('clock', { size: 16 }) }), `${stats.soon} por vencer`) : null,
      stats.expired ? h('span.hero__chip', h('span', { html: icon('alert', { size: 16 }) }), `${stats.expired} vencidos`) : null,
    ),
  ));

  root.appendChild(h('div.stat-grid.mt-2',
    stat('Registrados', stats.total, 'Productos del hogar', 'box', '', () => ctx.go('/inventario')),
    stat('Hay', stats.inStock, 'Disponibles', 'checkCircle', '', () => ctx.go('/inventario?status=in')),
    stat('No hay', stats.out, 'Por comprar', 'cart', stats.out ? 'stat--danger' : '', () => ctx.go('/lista')),
    stat('Por vencer', stats.soon + stats.expired, 'Revisa las fechas', 'clock',
      stats.expired ? 'stat--danger' : (stats.soon ? 'stat--warn' : ''), () => ctx.go('/inventario?status=soon')),
  ));

  /* ---- Vencimientos ---- */
  if (expiring.length) {
    const section = h('div.section',
      h('div.section-title', h('span', { html: icon('clock', { size: 19 }) }), 'Ojo con las fechas',
        h('span.count', String(expiring.length))));
    const list = h('div.list');
    expiring.slice(0, 4).forEach(({ product }) => list.appendChild(productRow(product, ctx)));
    if (expiring.length > 4) {
      list.appendChild(h('button.btn.btn-soft.btn-block', { type: 'button', onclick: () => ctx.go('/inventario?status=soon') },
        `Ver ${expiring.length - 4} más`));
    }
    section.appendChild(list);
    root.appendChild(section);
  }

  /* ---- Falta comprar ---- */
  const missingSection = h('div.section',
    h('div.section-title', h('span', { html: icon('cart', { size: 19 }) }), 'Falta comprar',
      h('span.count', missing.length ? String(missing.length) : ''),
      h('span.spacer'),
      missing.length ? h('button.card-link', { type: 'button', onclick: () => ctx.go('/lista') }, 'Ver lista') : null));

  if (!missing.length) {
    missingSection.appendChild(h('div.card', h('div.row', { style: { gap: '12px' } },
      h('div.thumb.thumb--ok', { html: icon('check', { size: 20 }) }),
      h('div.grow',
        h('div', { style: { fontWeight: 600 } }, 'No falta nada'),
        h('div.muted.small', 'Cuando algo se acabe, márcalo y aparecerá aquí.')),
    )));
  } else {
    const list = h('div.list');
    missing.slice(0, 5).forEach((product) => list.appendChild(h('div.tile',
      h('button.btn-icon', {
        type: 'button',
        'aria-label': `Marcar ${product.name} como comprado`,
        style: { background: 'var(--pine-soft)', color: 'var(--pine)' },
        html: icon('check', { size: 20 }),
        onclick: () => toggleStock(product),
      }),
      h('button', {
        type: 'button', class: 'grow',
        style: { background: 'transparent', border: 0, padding: 0, textAlign: 'left' },
        onclick: () => ctx.go(`/producto/${product.id}`),
      },
      h('div.tile__title', h('span.truncate', product.name)),
      h('div.tile__meta', [
        state.storesById.get(product.storeId)?.name,
        product.unit,
        `sin existencia ${formatRelative(product.statusChangedAt)}`,
      ].filter(Boolean).join(' · '))),
    )));
    if (missing.length > 5) {
      list.appendChild(h('button.btn.btn-soft.btn-block', { type: 'button', onclick: () => ctx.go('/lista') },
        `Ver ${missing.length - 5} más`));
    }
    missingSection.appendChild(list);
  }
  root.appendChild(missingSection);

  /* ---- Categorías ---- */
  const groups = groupByCategory(products);
  if (groups.length > 1) {
    const section = h('div.section',
      h('div.section-title', h('span', { html: icon('grid', { size: 19 }) }), 'Por categoría'));
    const row = h('div.chip-row');
    groups.forEach((group) => {
      const out = group.products.filter((p) => !p.inStock).length;
      row.appendChild(h('button.chip', {
        type: 'button',
        onclick: () => ctx.go(`/inventario?category=${group.categoryId || ''}`),
      },
      h('span', { style: { color: group.color }, html: icon(group.icon, { size: 15 }) }),
      group.name,
      h('span.chip__count', out ? `${group.products.length} · faltan ${out}` : String(group.products.length))));
    });
    section.appendChild(row);
    root.appendChild(section);
  }

  root.appendChild(h('div.muted.small.text-center', { style: { padding: '18px 0 0' } },
    plural(stats.total, 'producto') + ' en tu despensa'));

  return root;

  function stat(label, value, hint, iconName, variant, onClick) {
    return h('button', { class: `stat ${variant}`, type: 'button', onclick: onClick },
      h('span.stat__icon', { html: icon(iconName, { size: 18 }) }),
      h('div.stat__label', label),
      h('div.stat__value', String(value)),
      hint ? h('div.stat__hint', hint) : null);
  }
}
