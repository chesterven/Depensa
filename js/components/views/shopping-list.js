/** Lista de compras: automática, editable y agrupable por comercio. */
import { h, haptic } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';
import { money } from '../../utils/format.js';
import { state, pendingItems } from '../../state.js';
import { getPref, setPref } from '../../database/settings.js';
import {
  updateItem, removeItem, clearPending, refreshSuggestions, rebuildFromInventory,
  listTotals, groupByStore, markItemPurchased, undoPurchase,
} from '../../services/shopping-service.js';
import { emptyState } from '../ui/empty.js';
import { segmented } from '../ui/form.js';
import { openSheet } from '../ui/sheet.js';
import { confirmDialog } from '../ui/confirm.js';
import { toast, toastOk, toastError } from '../ui/toast.js';
import { openShoppingItemForm } from '../shopping-item-form.js';

export function render(ctx) {
  const items = pendingItems();
  const totals = listTotals(items);
  let grouped = getPref('ui.listGrouped', false);

  ctx.setHeader({
    title: 'Lista de compras',
    subtitle: items.length
      ? `${items.length} artículos${totals.total ? ` · ≈ ${money(totals.total)}` : ''}`
      : 'Todo cubierto',
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
      text: 'Los productos que marques como agotados aparecerán aquí automáticamente.',
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
          h('span.count', group.subtotal ? money(group.subtotal) : `${group.items.length}`),
        ),
        h('div.list', ...group.items.map((item) => itemTile(item))),
      ));
    });
  } else {
    root.appendChild(h('div.list', ...items.map((item) => itemTile(item))));
  }

  /* ---- Totales ---- */
  root.appendChild(h('div.card.mt-2',
    h('div.row.row--between',
      h('div',
        h('div.muted.small', totals.total ? 'Total estimado' : 'Artículos pendientes'),
        h('div.display', { style: { fontSize: '1.6rem' } }, totals.total ? money(totals.total) : String(items.length)),
        h('div.muted.small', totals.withPrice < items.length
          ? `${items.length - totals.withPrice} sin precio de referencia`
          : `${items.length} artículos`),
      ),
      h('button.btn.btn-soft', { type: 'button', onclick: () => shareList() },
        h('span', { html: icon('share', { size: 18 }) }), 'Compartir'),
    ),
  ));

  return root;

  function itemTile(item) {
    const product = state.productsById.get(item.productId);
    const unitPrice = Number(item.estimatedPrice);
    const hasPrice = isFinite(unitPrice) && unitPrice > 0;
    const estimated = hasPrice ? unitPrice * (Number(item.quantity) || 1) : null;
    const meta = [
      item.storeId ? state.storesById.get(item.storeId)?.name : null,
      product?.unit || null,
      hasPrice ? `${money(unitPrice)} c/u` : null,
    ].filter(Boolean).join(' · ');

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
        onclick: () => openItemMenu(item),
      },
      h('div.tile__title', item.name, item.auto ? h('span.badge.badge--low', 'automático') : null),
      h('div.tile__meta', meta || 'Sin comercio asignado')),
      h('div.tile__right',
        estimated != null ? h('div.tile__price', money(estimated)) : null,
        h('div.stepper', { style: { padding: '2px' } },
          h('button', {
            type: 'button', 'aria-label': `Menos ${item.name}`,
            style: { width: '30px', height: '30px' },
            disabled: (Number(item.quantity) || 1) <= 1,
            html: icon('minus', { size: 15 }),
            onclick: async () => {
              const next = (Number(item.quantity) || 1) - 1;
              if (next < 1) return;
              await updateItem(item.id, { quantity: next });
            },
          }),
          h('span.stepper__value', { style: { minWidth: '26px', width: '26px', fontSize: '.95rem' } }, String(item.quantity || 1)),
          h('button', {
            type: 'button', 'aria-label': `Más ${item.name}`,
            style: { width: '30px', height: '30px' },
            html: icon('plus', { size: 15 }),
            onclick: async () => { await updateItem(item.id, { quantity: (Number(item.quantity) || 1) + 1 }); },
          }),
        ),
      ),
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

  function openItemMenu(item) {
    openSheet({
      title: item.name,
      subtitle: `${item.quantity} · ${state.storesById.get(item.storeId)?.name || 'sin comercio'}`,
      dialog: true,
      content: (api) => h('div.menu-list',
        menuItem('check', 'Marcar como comprado', 'Vuelve a estar disponible en el inventario', () => { api.close(); buy(item); }),
        menuItem('pencil', 'Editar artículo', 'Cantidad, comercio y precio estimado', () => { api.close(); openShoppingItemForm(item); }),
        item.productId ? menuItem('box', 'Ver producto', 'Ficha completa', () => { api.close(); ctx.go(`/producto/${item.productId}`); }) : null,
        menuItem('trash', 'Quitar de la lista', 'El producto sigue marcado como agotado', async () => {
          api.close();
          await removeItem(item.id);
          toastOk('Artículo eliminado de la lista');
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

  /** Comparte la lista como texto (WhatsApp, correo…). */
  async function shareList() {
    const groups = groupByStore(items);
    const lines = [`🛒 Lista de compras (${items.length})`, ''];
    groups.forEach((group) => {
      lines.push(`— ${group.storeName}`);
      group.items.forEach((item) => {
        const price = Number(item.estimatedPrice);
        const estimated = isFinite(price) && price > 0 ? `  (≈ ${money(price * (Number(item.quantity) || 1))})` : '';
        lines.push(`• ${item.quantity > 1 ? `${item.quantity} × ` : ''}${item.name}${estimated}`);
      });
      lines.push('');
    });
    if (totals.total) lines.push(`Total estimado: ${money(totals.total)}`);
    const text = lines.join('\n');
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Lista de compras', text });
      } else {
        await navigator.clipboard.writeText(text);
        toastOk('Lista copiada al portapapeles');
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(text);
        toastOk('Lista copiada al portapapeles');
      } catch (_) {
        toastError('No se pudo compartir la lista.');
      }
    }
  }

  function openMenu() {
    openSheet({
      title: 'Opciones de la lista',
      dialog: true,
      content: (api) => h('div.menu-list',
        menuItem('share', 'Compartir lista', 'Envíala por WhatsApp, correo o mensajes', () => { api.close(); shareList(); }),
        menuItem('refresh', 'Actualizar datos', 'Recupera comercio y precio desde cada producto', async () => {
          api.close();
          try {
            const count = await refreshSuggestions();
            toastOk(`${count} artículos actualizados`);
          } catch (error) { toastError(error); }
        }),
        menuItem('box', 'Revisar inventario', 'Agrega todo lo que esté agotado', async () => {
          api.close();
          await rebuildFromInventory();
          toastOk('Lista sincronizada con el inventario');
        }),
        menuItem('trash', 'Vaciar lista', 'Los productos siguen marcados como agotados', async () => {
          api.close();
          const ok = await confirmDialog({
            title: '¿Vaciar la lista?',
            message: 'Se quitarán todos los artículos pendientes. Los productos agotados volverán a agregarse si usas «Revisar inventario».',
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
