/** Inicio: resumen del estado del hogar. */
import { h, haptic } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';
import { money, plural } from '../../utils/format.js';
import { formatRelative } from '../../utils/date.js';
import { state, pendingItems } from '../../state.js';
import { inventorySummary, isOut, recentProducts, recentlyPurchased } from '../../services/inventory-service.js';
import { listTotals, markItemPurchased, undoPurchase } from '../../services/shopping-service.js';
import { emptyState } from '../ui/empty.js';
import { toast, toastOk, toastError } from '../ui/toast.js';
import { openProductForm } from '../product-form.js';
import { loadDemoData } from '../../services/demo-data.js';

export function render(ctx) {
  ctx.setHeader({
    title: state.settings?.householdName || 'Mi hogar',
    subtitle: 'Resumen de tu despensa',
    actions: [{ iconName: 'plus', label: 'Nuevo producto', onClick: () => openProductForm() }],
  });
  ctx.onState(() => ctx.refresh());

  const root = h('div');
  const products = state.products;
  const summary = inventorySummary(products);
  const pending = pendingItems();
  const totals = listTotals(pending);

  if (!products.length) {
    root.appendChild(h('div.card', emptyState({
      iconName: 'jar',
      title: 'Tu despensa está vacía',
      text: 'Agrega los productos que sueles tener en casa o carga datos de ejemplo para ver cómo funciona.',
      actionLabel: 'Agregar producto',
      onAction: () => openProductForm(),
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

  /* ---- Resumen principal ---- */
  root.appendChild(h('div.hero',
    h('div.hero__label', 'Pendientes de comprar'),
    h('div.hero__value', String(pending.length)),
    h('div.hero__meta',
      totals.total > 0 ? h('span.hero__chip', h('span', { html: icon('calculator', { size: 16 }) }), `≈ ${money(totals.total)}`) : null,
      h('span.hero__chip', h('span', { html: icon('checkCircle', { size: 16 }) }), `${summary.available} con existencia`),
      h('span.hero__chip', h('span', { html: icon('alert', { size: 16 }) }), `${summary.out} agotados`),
    ),
  ));

  root.appendChild(h('div.stat-grid.mt-2',
    statCard({ label: 'En inventario', value: summary.total, hint: 'Productos registrados', iconName: 'box', onClick: () => ctx.go('/inventario') }),
    statCard({ label: 'Con existencia', value: summary.available, hint: 'Disponibles en casa', iconName: 'checkCircle', onClick: () => ctx.go('/inventario?status=available') }),
    statCard({ label: 'Agotados', value: summary.out, hint: 'Hay que comprarlos', iconName: 'alert', variant: summary.out ? 'stat--danger' : '', onClick: () => ctx.go('/inventario?status=out') }),
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
      h('div.grow',
        h('div', { style: { fontWeight: 600 } }, 'No falta nada'),
        h('div.muted.small', 'Cuando marques un producto como agotado aparecerá aquí.')),
    )));
  } else {
    const list = h('div.list');
    pending.slice(0, 5).forEach((item) => list.appendChild(quickItem(item)));
    if (pending.length > 5) {
      list.appendChild(h('button.btn.btn-soft.btn-block', { type: 'button', onclick: () => ctx.go('/lista') },
        `Ver ${pending.length - 5} más`));
    }
    quickSection.appendChild(list);
  }
  root.appendChild(quickSection);

  /* ---- Comprados recientemente ---- */
  const purchased = recentlyPurchased(4);
  if (purchased.length) {
    const section = h('div.section',
      h('div.section-title', h('span', { html: icon('checkCircle', { size: 19 }) }), 'Comprados recientemente'));
    const list = h('div.list');
    purchased.forEach((product) => {
      list.appendChild(h('button.tile', { type: 'button', onclick: () => ctx.go(`/producto/${product.id}`) },
        h('div.thumb', { html: icon('cart', { size: 18 }) }),
        h('div.tile__body',
          h('div.tile__title', product.name),
          h('div.tile__meta',
            state.storesById.get(product.storeId)?.name || 'Sin comercio',
            ' · ', formatRelative(product.lastPurchasedAt)),
        ),
        h('div.tile__right', h('span', { class: `badge badge--${isOut(product) ? 'out' : 'ok'}` },
          isOut(product) ? 'Agotado' : 'Disponible')),
      ));
    });
    section.appendChild(list);
    root.appendChild(section);
  }

  /* ---- Agregados recientemente ---- */
  const recents = recentProducts(8);
  if (recents.length) {
    const section = h('div.section',
      h('div.section-title', h('span', { html: icon('sparkles', { size: 19 }) }), 'Agregados recientemente'));
    const row = h('div.chip-row');
    recents.forEach((product) => {
      row.appendChild(h('button.chip', { type: 'button', onclick: () => ctx.go(`/producto/${product.id}`) },
        h('span', { class: `dot dot--${isOut(product) ? 'out' : 'ok'}` }),
        product.name));
    });
    section.appendChild(row);
    root.appendChild(section);
  }

  return root;

  function quickItem(item) {
    const product = state.productsById.get(item.productId);
    const price = Number(item.estimatedPrice);
    const estimated = isFinite(price) && price > 0 ? price * (Number(item.quantity) || 1) : null;
    return h('div.tile',
      h('button.btn-icon', {
        type: 'button',
        'aria-label': `Marcar ${item.name} como comprado`,
        style: { background: 'var(--pine-soft)', color: 'var(--pine)' },
        html: icon('check', { size: 20 }),
        onclick: () => buy(item),
      }),
      h('button', {
        type: 'button',
        class: 'grow',
        style: { background: 'transparent', border: 0, padding: 0, textAlign: 'left' },
        onclick: () => item.productId ? ctx.go(`/producto/${item.productId}`) : ctx.go('/lista'),
      },
      h('div.tile__title', item.name),
      h('div.tile__meta',
        item.quantity > 1 ? h('span', `${item.quantity} · `) : null,
        product?.unit || '',
        item.storeId ? h('span', `${product?.unit ? ' · ' : ''}${state.storesById.get(item.storeId)?.name || ''}`) : null,
      )),
      estimated != null ? h('div.tile__right', h('div.tile__price', money(estimated))) : null,
    );
  }

  async function buy(item) {
    haptic();
    try {
      const snapshot = await markItemPurchased(item.id);
      toast(`«${item.name}» vuelve a estar disponible`, {
        type: 'ok',
        duration: 5000,
        action: { label: 'Deshacer', onClick: () => undoPurchase(snapshot).catch(toastError) },
      });
    } catch (error) {
      toastError(error, 'No se pudo marcar como comprado.');
    }
  }
}

function statCard({ label, value, hint, iconName, variant = '', onClick }) {
  return h('button', { class: `stat ${variant}`, type: 'button', onclick: onClick },
    h('span.stat__icon', { html: icon(iconName, { size: 18 }) }),
    h('div.stat__label', label),
    h('div.stat__value', String(value)),
    hint ? h('div.stat__hint', hint) : null,
  );
}
