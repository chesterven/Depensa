/** Lista de compras: automática, editable y con presupuesto estimado. */
import { h, haptic } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';
import { money, qty as fmtQty, round } from '../../utils/format.js';
import { state, pendingItems } from '../../state.js';
import { getPref, setPref } from '../../database/settings.js';
import { updateItem, removeItem, clearPending, refreshSuggestions, rebuildFromInventory, listTotals, groupByStore } from '../../services/shopping-service.js';
import { emptyState } from '../ui/empty.js';
import { segmented } from '../ui/form.js';
import { openSheet } from '../ui/sheet.js';
import { confirmDialog } from '../ui/confirm.js';
import { toastOk, toastError } from '../ui/toast.js';
import { openPurchaseForm } from '../purchase-form.js';
import { openShoppingItemForm } from '../shopping-item-form.js';

export function render(ctx) {
  const items = pendingItems();
  const totals = listTotals(items);
  let grouped = getPref('ui.listGrouped', false);

  ctx.setHeader({
    title: 'Lista de compras',
    subtitle: items.length ? `${items.length} artículos · ≈ ${money(totals.total)}` : 'Todo cubierto',
    actions: [
      { iconName: 'plus', label: 'Agregar artículo', onClick: () => openShoppingItemForm() },
      { iconName: 'dots', label: 'Más opciones', onClick: () => openMenu() },
    ],
  });
  ctx.onState(() => ctx.refresh());

  const root = h('div');

  if (!items.length) {
    root.appendChild(emptyState({
      iconName: 'checkCircle',
      title: 'No falta nada',
      text: 'Los productos agotados o por debajo del mínimo se agregan aquí automáticamente.',
      actionLabel: 'Agregar artículo',
      onAction: () => openShoppingItemForm(),
      secondaryLabel: 'Revisar inventario',
      onSecondary: async () => {
        await rebuildFromInventory();
        toastOk('Lista sincronizada con el inventario');
      },
    }));
    return root;
  }

  root.appendChild(h('div', { style: { marginBottom: '12px' } },
    segmented([
      { value: 'flat', label: 'Lista' },
      { value: 'store', label: 'Por comercio' },
    ], grouped ? 'store' : 'flat', (value) => {
      grouped = value === 'store';
      setPref('ui.listGrouped', grouped);
      ctx.refresh();
    }),
  ));

  if (grouped) {
    groupByStore(items).forEach((group) => {
      root.appendChild(h('div.section', { style: { marginTop: '14px' } },
        h('div.section-title',
          h('span', { html: icon('store', { size: 18 }) }),
          group.storeName,
          h('span.spacer'),
          h('span.count', money(group.subtotal)),
        ),
        h('div.list', ...group.items.map((item) => itemTile(item, ctx))),
      ));
    });
  } else {
    root.appendChild(h('div.list', ...items.map((item) => itemTile(item, ctx))));
  }

  /* ---- Totales ---- */
  root.appendChild(h('div.card.mt-2',
    h('div.row.row--between',
      h('div',
        h('div.muted.small', 'Presupuesto estimado'),
        h('div.display', { style: { fontSize: '1.6rem' } }, money(totals.total)),
        totals.withPrice < items.length
          ? h('div.muted.small', `${items.length - totals.withPrice} sin precio conocido`)
          : h('div.muted.small', `${items.length} artículos`),
      ),
      h('button.btn.btn-primary', {
        type: 'button',
        onclick: () => ctx.go('/presupuesto'),
      }, h('span', { html: icon('calculator', { size: 18 }) }), 'Presupuesto'),
    ),
  ));

  return root;

  function itemTile(item, context) {
    const product = state.productsById.get(item.productId);
    const unitPrice = Number(item.estimatedPrice);
    const hasPrice = isFinite(unitPrice) && unitPrice > 0;
    const estimated = hasPrice ? round(unitPrice * (Number(item.quantity) || 0), 2) : null;

    return h('div.tile',
      h('button.btn-icon', {
        type: 'button',
        'aria-label': `Marcar ${item.name} como comprado`,
        style: { background: 'var(--pine-soft)', color: 'var(--pine)' },
        html: icon('check', { size: 20 }),
        onclick: () => {
          haptic();
          openPurchaseForm({
            productId: item.productId,
            shoppingItemId: item.id,
            quantity: item.quantity,
            storeId: item.storeId,
            unitPrice: item.estimatedPrice,
          });
        },
      }),
      h('button', {
        type: 'button',
        class: 'grow',
        style: { background: 'transparent', border: 0, padding: 0, textAlign: 'left' },
        onclick: () => openItemMenu(item),
      },
      h('div.tile__title', item.name, item.auto ? h('span.badge.badge--low', 'automático') : null),
      h('div.tile__meta',
        `${fmtQty(item.quantity)} ${product?.unit || ''}`.trim(),
        hasPrice ? h('span', ` · ${money(unitPrice)} c/u`) : h('span', ' · sin precio'),
        item.storeId ? h('span', ` · ${state.storesById.get(item.storeId)?.name || ''}`) : null,
      )),
      h('div.tile__right',
        estimated != null ? h('div.tile__price', money(estimated)) : null,
        h('div.stepper', { style: { padding: '2px' } },
          h('button', {
            type: 'button', 'aria-label': `Menos ${item.name}`,
            style: { width: '30px', height: '30px' },
            disabled: (Number(item.quantity) || 0) <= 1,
            html: icon('minus', { size: 15 }),
            onclick: async () => {
              const next = round((Number(item.quantity) || 1) - 1, 3);
              if (next <= 0) return;
              await updateItem(item.id, { quantity: next, auto: item.auto });
            },
          }),
          h('span.stepper__value', { style: { minWidth: '28px', fontSize: '.95rem' } }, fmtQty(item.quantity)),
          h('button', {
            type: 'button', 'aria-label': `Más ${item.name}`,
            style: { width: '30px', height: '30px' },
            html: icon('plus', { size: 15 }),
            onclick: async () => {
              await updateItem(item.id, { quantity: round((Number(item.quantity) || 0) + 1, 3), auto: item.auto });
            },
          }),
        ),
      ),
    );

    function openItemMenu(target) {
      openSheet({
        title: target.name,
        subtitle: `${fmtQty(target.quantity)} · ${hasPrice ? money(unitPrice) + ' c/u' : 'sin precio estimado'}`,
        dialog: true,
        content: (api) => h('div.menu-list',
          menuItem('check', 'Marcar como comprado', 'Registra la compra y actualiza el inventario', () => {
            api.close();
            openPurchaseForm({
              productId: target.productId,
              shoppingItemId: target.id,
              quantity: target.quantity,
              storeId: target.storeId,
              unitPrice: target.estimatedPrice,
            });
          }),
          menuItem('pencil', 'Editar artículo', 'Cantidad, comercio y precio estimado', () => {
            api.close();
            openShoppingItemForm(target);
          }),
          target.productId ? menuItem('box', 'Ver producto', 'Precios e historial', () => {
            api.close();
            context.go(`/producto/${target.productId}`);
          }) : null,
          menuItem('trash', 'Quitar de la lista', '', async () => {
            api.close();
            await removeItem(target.id);
            toastOk('Artículo eliminado de la lista');
          }, true),
        ),
      });
    }
  }

  function menuItem(iconName, title, hint, onClick, danger = false) {
    return h('button.menu-item', { type: 'button', onclick: onClick },
      h('span.menu-item__icon', { style: danger ? { color: 'var(--danger)' } : null, html: icon(iconName, { size: 18 }) }),
      h('div.menu-item__body',
        h('div.menu-item__title', title),
        hint ? h('div.menu-item__hint', hint) : null),
      h('span.chevron', { html: icon('chevronRight', { size: 18 }) }),
    );
  }

  function openMenu() {
    openSheet({
      title: 'Opciones de la lista',
      dialog: true,
      content: (api) => h('div.menu-list',
        menuItem('calculator', 'Generar presupuesto', 'Divide la compra por comercio', () => { api.close(); ctx.go('/presupuesto'); }),
        menuItem('refresh', 'Actualizar sugerencias', 'Recalcula precios y comercios recomendados', async () => {
          api.close();
          try {
            const count = await refreshSuggestions();
            toastOk(`${count} artículos actualizados`);
          } catch (error) { toastError(error); }
        }),
        menuItem('box', 'Revisar inventario', 'Agrega lo que esté agotado o bajo el mínimo', async () => {
          api.close();
          await rebuildFromInventory();
          toastOk('Lista sincronizada con el inventario');
        }),
        menuItem('trash', 'Vaciar lista', 'Elimina todos los artículos pendientes', async () => {
          api.close();
          const ok = await confirmDialog({
            title: '¿Vaciar la lista?',
            message: 'Se quitarán todos los artículos pendientes. Los productos agotados volverán a agregarse cuando cambies su cantidad.',
            confirmText: 'Vaciar',
          });
          if (!ok) return;
          const count = await clearPending();
          toastOk(`${count} artículos eliminados`);
        }, true),
      ),
    });
  }
}
