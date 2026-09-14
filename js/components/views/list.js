/** Lista de compras: todo lo que está marcado como «no hay». */
import { h } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';
import { money, plural } from '../../utils/format.js';
import { state } from '../../state.js';
import { shoppingList, groupByStore } from '../../services/inventory.js';
import { toggleStock, shoppingListText } from '../../services/actions.js';
import { emptyState } from '../ui/empty.js';
import { toastOk, toastError } from '../ui/toast.js';
import { openProductForm } from '../product-form.js';
import { openSheet } from '../ui/sheet.js';

export function render(ctx) {
  const missing = shoppingList(state.products);
  const estimate = missing.reduce((sum, p) => sum + (Number(p.referencePrice) || 0), 0);

  ctx.setHeader({
    title: 'Falta comprar',
    subtitle: missing.length
      ? `${plural(missing.length, 'producto')}${estimate ? ` · ≈ ${money(estimate)}` : ''}`
      : 'Nada pendiente',
    actions: [
      { iconName: 'share', label: 'Compartir lista', onClick: () => share(missing) },
      { iconName: 'plus', label: 'Agregar producto', onClick: () => openProductForm(null, { defaults: { inStock: false } }) },
    ],
  });
  ctx.onState(() => ctx.refresh());

  const root = h('div');

  if (!missing.length) {
    root.appendChild(emptyState({
      iconName: 'checkCircle',
      title: 'No falta nada',
      text: 'Cuando marques algo como agotado en el inventario aparecerá aquí.',
      actionLabel: 'Ir al inventario',
      onAction: () => ctx.go('/inventario'),
    }));
    return root;
  }

  groupByStore(missing).forEach((group) => {
    const subtotal = group.products.reduce((sum, p) => sum + (Number(p.referencePrice) || 0), 0);
    root.appendChild(h('div.section', { style: { marginTop: '14px' } },
      h('div.section-title',
        h('span', { html: icon('store', { size: 18 }) }),
        group.storeName,
        h('span.spacer'),
        h('span.count', subtotal ? money(subtotal) : String(group.products.length))),
      h('div.list', ...group.products.map((product) => listRow(product))),
    ));
  });

  root.appendChild(h('div.card.mt-2',
    h('div.row.row--between',
      h('div',
        h('div.muted.small', estimate ? 'Costo aproximado' : 'Pendientes'),
        h('div.display', { style: { fontSize: '1.6rem' } }, estimate ? money(estimate) : String(missing.length)),
        h('div.muted.small', estimate ? plural(missing.length, 'producto') : 'Según tus precios de referencia'),
      ),
      h('button.btn.btn-soft', { type: 'button', onclick: () => share(missing) },
        h('span', { html: icon('share', { size: 18 }) }), 'Compartir'),
    ),
  ));

  return root;

  function listRow(product) {
    const category = state.categoriesById.get(product.categoryId);
    return h('div.tile',
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
      h('div.tile__meta', [category?.name, product.unit].filter(Boolean).join(' · ') || 'Sin detalles')),
      product.referencePrice != null
        ? h('div.tile__right', h('div.tile__price', money(product.referencePrice)))
        : null,
    );
  }

  async function share(products) {
    if (!products.length) {
      toastOk('No hay nada pendiente que compartir');
      return;
    }
    const text = shoppingListText(products);
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Falta en casa', text });
        return;
      }
      await navigator.clipboard.writeText(text);
      toastOk('Lista copiada al portapapeles');
    } catch (error) {
      if (error?.name === 'AbortError') return;
      openSheet({
        title: 'Lista de compras',
        content: h('pre.code-block', text),
        actions: [{ label: 'Cerrar', variant: 'btn-soft', onClick: () => {} }],
      });
      void toastError;
    }
  }
}
