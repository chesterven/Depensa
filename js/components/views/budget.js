/** Presupuesto de compras, segmentado por comercio. */
import { h } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';
import { money, qty as fmtQty, toNumber, plural } from '../../utils/format.js';
import { state } from '../../state.js';
import {
  loadBudget, saveBudget, clearBudget, budgetFromShoppingList,
  computeBudget, autoAssignStores, createBudgetItem, registerGroupPurchases, estimatePrice,
} from '../../services/budget-service.js';
import { bestStoreFor } from '../../services/price-service.js';
import { emptyState } from '../ui/empty.js';
import { field, select, numberInput, moneyInput, readForm } from '../ui/form.js';
import { openSheet } from '../ui/sheet.js';
import { confirmDialog } from '../ui/confirm.js';
import { toastOk, toastError } from '../ui/toast.js';

export async function render(ctx) {
  let budget = await loadBudget();
  const pendingCount = state.shoppingList.filter((item) => item.status === 'pending').length;

  ctx.setHeader({
    title: 'Presupuesto',
    subtitle: budget ? budget.name : 'Calcula tu compra antes de salir',
    back: true,
    actions: budget ? [{ iconName: 'dots', label: 'Opciones', onClick: () => openMenu() }] : [],
  });
  ctx.onState(() => ctx.refresh());

  const root = h('div');

  if (!budget || !budget.items.length) {
    root.appendChild(emptyState({
      iconName: 'calculator',
      title: 'Sin presupuesto activo',
      text: pendingCount
        ? `Genera un presupuesto con los ${pendingCount} artículos pendientes de tu lista de compras.`
        : 'Agrega artículos a tu lista de compras y vuelve aquí para calcular cuánto gastarás.',
      actionLabel: pendingCount ? 'Generar desde la lista' : 'Ir a la lista de compras',
      onAction: async () => {
        if (!pendingCount) { ctx.go('/lista'); return; }
        await saveBudget(budgetFromShoppingList());
        toastOk('Presupuesto generado');
        ctx.refresh();
      },
    }));
    return root;
  }

  const result = computeBudget(budget);

  /* ---- Resumen ---- */
  root.appendChild(h('div.hero',
    h('div.hero__label', 'Total estimado'),
    h('div.hero__value', money(result.total)),
    h('div.hero__meta',
      h('span.hero__chip', h('span', { html: icon('box', { size: 16 }) }), plural(result.itemCount, 'producto')),
      h('span.hero__chip', h('span', { html: icon('store', { size: 16 }) }), plural(result.storeCount, 'comercio')),
      result.savings > 0
        ? h('span.hero__chip', h('span', { html: icon('trendingDown', { size: 16 }) }), `Ahorro estimado ${money(result.savings)}`)
        : null,
    ),
  ));

  if (result.missingPrice) {
    root.appendChild(h('div.notice.mt-2',
      h('span', { html: icon('alert', { size: 18 }) }),
      h('span.grow', `${result.missingPrice} ${result.missingPrice === 1 ? 'artículo no tiene' : 'artículos no tienen'} precio estimado. Tócalos para escribir un precio.`)));
  }

  root.appendChild(h('div.row.mt-2', { style: { gap: '8px' } },
    h('button.btn.btn-soft.grow', {
      type: 'button',
      onclick: async () => {
        budget = await saveBudget(autoAssignStores(budget));
        toastOk('Comercios asignados según el mejor precio promedio');
        ctx.refresh();
      },
    }, h('span', { html: icon('sparkles', { size: 18 }) }), 'Asignar comercios'),
    h('button.btn.btn-soft', {
      type: 'button',
      'aria-label': 'Agregar artículo',
      onclick: () => openItemForm(null),
    }, h('span', { html: icon('plus', { size: 18 }) }), 'Artículo'),
  ));

  /* ---- Grupos por comercio ---- */
  result.groups.forEach((group) => {
    const section = h('div.section',
      h('div.section-title',
        h('span', { html: icon(group.storeId ? 'store' : 'alert', { size: 18 }) }),
        group.storeName,
        h('span.spacer'),
        h('span.count', money(group.subtotal)),
      ),
    );
    const card = h('div.card');
    group.items.forEach((item, index) => {
      card.appendChild(h('button', {
        type: 'button',
        class: 'row',
        style: {
          width: '100%', background: 'transparent', border: 0, textAlign: 'left',
          padding: '11px 0', borderTop: index ? '1px solid var(--line)' : '0', gap: '10px',
        },
        onclick: () => openItemForm(item),
      },
      h('div.grow',
        h('div', { style: { fontWeight: 600 } }, item.name),
        h('div.muted.small', `${fmtQty(item.quantity)} ${item.unit} · ${item.hasPrice ? `${money(item.unitPrice)} c/u` : 'sin precio'}`),
      ),
      h('div.text-right',
        h('div.display', item.hasPrice ? money(item.subtotal) : '—'),
      ),
      h('span.chevron.muted', { html: icon('chevronRight', { size: 18 }) }),
      ));
    });
    card.appendChild(h('div.row.row--between.mt-2', { style: { borderTop: '1px solid var(--line)', paddingTop: '12px' } },
      h('div',
        h('div.muted.small', 'Subtotal'),
        h('div.display', { style: { fontSize: '1.2rem' } }, money(group.subtotal)),
      ),
      group.storeId ? h('button.btn.btn-soft.btn-sm', {
        type: 'button',
        onclick: () => registerGroup(group),
      }, h('span', { html: icon('check', { size: 16 }) }), 'Registrar compras') : null,
    ));
    section.appendChild(card);
    root.appendChild(section);
  });

  /* ---- Total ---- */
  root.appendChild(h('div.card.mt-2',
    h('div.row.row--between',
      h('div', h('div.muted.small', 'Total general'), h('div.display', { style: { fontSize: '1.7rem' } }, money(result.total))),
      h('div.text-right',
        h('div.muted.small', 'Artículos'),
        h('div.display', { style: { fontSize: '1.7rem' } }, String(result.itemCount)),
      ),
    ),
    result.savings > 0 ? h('div.notice.notice--ok.mt-2',
      h('span', { html: icon('trendingDown', { size: 18 }) }),
      h('span.grow', `Comprando en los comercios asignados ahorras aproximadamente ${money(result.savings)} frente al comercio más caro de tu historial.`)) : null,
  ));

  return root;

  async function registerGroup(group) {
    const ok = await confirmDialog({
      title: `Registrar ${plural(group.count, 'compra')}`,
      message: `Se guardarán las compras de ${group.storeName} por ${money(group.subtotal)}, se actualizará el inventario y se recalcularán los precios promedio.`,
      confirmText: 'Registrar',
      danger: false,
    });
    if (!ok) return;
    try {
      const outcome = await registerGroupPurchases(budget, group.storeId);
      toastOk(`${outcome.registered} compras registradas`);
      ctx.refresh();
    } catch (error) {
      toastError(error, 'No se pudieron registrar las compras.');
    }
  }

  function openItemForm(item) {
    const isNew = !item;
    const products = [...state.products].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    const productSelect = select(
      [{ value: '', label: 'Selecciona un producto' }, ...products.map((p) => ({ value: p.id, label: p.name }))],
      item?.productId || '', { name: 'productId' },
    );
    const quantityInput = numberInput({ name: 'quantity', value: item?.quantity ?? 1, min: '0.001' });
    const storeSelect = select(
      [{ value: '', label: 'Sin asignar' }, ...state.stores.map((s) => ({ value: s.id, label: s.name }))],
      item?.storeId || '', { name: 'storeId' },
    );
    const priceWrap = moneyInput(state.settings?.currency?.symbol || '$', { name: 'unitPrice', value: item?.unitPrice ?? '' });
    const hint = h('div.field__hint');

    function updateHint() {
      const productId = item?.productId || productSelect.value;
      if (!productId) { hint.textContent = ''; return; }
      const best = bestStoreFor(productId);
      hint.textContent = best
        ? `Recomendado: ${best.storeName} — ${money(best.avg)} en promedio.`
        : 'Sin historial suficiente para recomendar un comercio.';
    }
    storeSelect.addEventListener('change', () => {
      const productId = item?.productId || productSelect.value;
      const suggestion = estimatePrice(productId, storeSelect.value || null);
      if (suggestion != null) priceWrap.querySelector('input').value = suggestion;
    });
    productSelect.addEventListener('change', () => {
      const best = bestStoreFor(productSelect.value);
      if (best && !storeSelect.value) storeSelect.value = best.storeId;
      const suggestion = estimatePrice(productSelect.value, storeSelect.value || null);
      if (suggestion != null) priceWrap.querySelector('input').value = suggestion;
      updateHint();
    });
    updateHint();

    const form = h('form', { onsubmit: (e) => e.preventDefault() },
      isNew ? field('Producto', productSelect, { required: true }) : h('div.tile.mb-2',
        h('div.thumb', { html: icon('box', { size: 18 }) }),
        h('div.tile__body', h('div.tile__title', item.name), h('div.tile__meta', item.unit))),
      h('div.form-row',
        field('Cantidad', quantityInput),
        field('Comercio', storeSelect),
      ),
      field('Precio unitario estimado', priceWrap),
      hint,
    );

    openSheet({
      title: isNew ? 'Agregar al presupuesto' : item.name,
      content: form,
      actions: [
        !isNew ? {
          label: 'Quitar',
          variant: 'btn-danger-soft',
          onClick: async () => {
            budget = await saveBudget({ ...budget, items: budget.items.filter((i) => i.id !== item.id) });
            toastOk('Artículo eliminado del presupuesto');
            ctx.refresh();
          },
        } : { label: 'Cancelar', variant: 'btn-soft', onClick: () => {} },
        {
          label: 'Guardar',
          variant: 'btn-primary',
          onClick: async () => {
            const values = readForm(form);
            const productId = item?.productId || values.productId || null;
            const product = state.productsById.get(productId);
            if (isNew && !productId) { toastError('Elige un producto.'); return false; }
            const next = createBudgetItem({
              id: item?.id,
              productId,
              name: product?.name || item?.name || 'Producto',
              unit: product?.unit || item?.unit || 'unidad',
              quantity: toNumber(values.quantity, 1),
              storeId: values.storeId || null,
              unitPrice: values.unitPrice === '' ? null : toNumber(values.unitPrice, 0),
            });
            const items = isNew
              ? [...budget.items, next]
              : budget.items.map((i) => (i.id === item.id ? next : i));
            budget = await saveBudget({ ...budget, items });
            ctx.refresh();
            return true;
          },
        },
      ],
    });
  }

  function openMenu() {
    openSheet({
      title: 'Opciones del presupuesto',
      dialog: true,
      content: (api) => h('div.menu-list',
        menuItem('refresh', 'Regenerar desde la lista', 'Reemplaza los artículos con los pendientes actuales', async () => {
          api.close();
          budget = await saveBudget(budgetFromShoppingList());
          toastOk('Presupuesto actualizado');
          ctx.refresh();
        }),
        menuItem('sparkles', 'Asignar comercios automáticamente', 'Usa el mejor precio promedio de cada producto', async () => {
          api.close();
          budget = await saveBudget(autoAssignStores(budget));
          ctx.refresh();
        }),
        menuItem('trash', 'Borrar presupuesto', '', async () => {
          api.close();
          const ok = await confirmDialog({ title: '¿Borrar el presupuesto?', message: 'La lista de compras no se modifica.', confirmText: 'Borrar' });
          if (!ok) return;
          await clearBudget();
          toastOk('Presupuesto borrado');
          ctx.refresh();
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
}
