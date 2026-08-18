/** Ficha del producto: estado, comercio habitual y precio de referencia. */
import { h, haptic } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';
import { money, moneyOrDash, initials } from '../../utils/format.js';
import { formatDate, formatRelative } from '../../utils/date.js';
import { state, isInList } from '../../state.js';
import { getPhoto } from '../../database/photos.js';
import {
  isOut, markAsOut, markAsPurchased, deleteProduct, setStore,
  restoreProductState, snapshotProduct,
} from '../../services/inventory-service.js';
import { addItem, removeItem } from '../../services/shopping-service.js';
import { emptyState } from '../ui/empty.js';
import { openSheet } from '../ui/sheet.js';
import { confirmDialog } from '../ui/confirm.js';
import { toast, toastOk, toastError } from '../ui/toast.js';
import { openProductForm } from '../product-form.js';
import { openStoreForm } from '../store-form.js';
import { select } from '../ui/form.js';

const NEW_STORE = '__new__';

export function render(ctx) {
  const product = state.productsById.get(ctx.params.id);
  if (!product) {
    ctx.setHeader({ title: 'Producto', back: true });
    return emptyState({
      iconName: 'alert',
      title: 'Producto no encontrado',
      text: 'Es posible que se haya eliminado.',
      actionLabel: 'Ir al inventario',
      onAction: () => ctx.go('/inventario'),
    });
  }

  ctx.setHeader({
    title: product.name,
    subtitle: state.categoriesById.get(product.categoryId)?.name || 'Sin categoría',
    back: true,
    actions: [
      { iconName: 'pencil', label: 'Editar', onClick: () => openProductForm(product) },
      { iconName: 'trash', label: 'Eliminar', onClick: () => removeProduct() },
    ],
  });
  ctx.onState(() => ctx.refresh());

  const out = isOut(product);
  const inList = isInList(product.id);
  const root = h('div');

  /* ---- Encabezado ---- */
  const thumb = h('div', { class: `thumb thumb--lg thumb--${out ? 'out' : 'ok'}` }, initials(product.name));
  if (product.hasPhoto) {
    getPhoto(product.id).then((photo) => {
      if (photo?.dataUrl) thumb.replaceChildren(h('img', { src: photo.dataUrl, alt: `Foto de ${product.name}` }));
    }).catch(() => {});
  }

  root.appendChild(h('div.card',
    h('div.row', { style: { gap: '14px', alignItems: 'flex-start' } },
      thumb,
      h('div.grow',
        h('h2', { style: { marginBottom: '6px' } }, product.name),
        h('div.row.row--wrap', { style: { gap: '6px' } },
          h('span', { class: `badge badge--${out ? 'out' : 'ok'}` }, out ? 'Agotado' : 'Con existencia'),
          product.unit ? h('span.badge.badge--done', product.unit) : null,
          inList ? h('span.badge.badge--info', 'En la lista') : null,
        ),
        product.notes ? h('p.muted.small', { style: { marginTop: '8px', marginBottom: 0 } }, product.notes) : null,
      ),
    ),
    h('div.row.mt-2', { style: { gap: '8px' } },
      out
        ? h('button.btn.btn-primary.grow', { type: 'button', onclick: () => setStatus(false) },
          h('span', { html: icon('check', { size: 18 }) }), 'Ya lo compré')
        : h('button.btn.btn-primary.grow', { type: 'button', onclick: () => setStatus(true) },
          h('span', { html: icon('cart', { size: 18 }) }), 'Marcar agotado'),
      inList
        ? h('button.btn.btn-soft', { type: 'button', onclick: () => leaveList() },
          h('span', { html: icon('close', { size: 18 }) }), 'Quitar de la lista')
        : h('button.btn.btn-soft', { type: 'button', onclick: () => joinList() },
          h('span', { html: icon('list', { size: 18 }) }), 'A la lista'),
    ),
  ));

  /* ---- Detalles ---- */
  root.appendChild(h('div.card.mt-2',
    h('div.card-head', h('h3', 'Detalles')),
    infoRow('store', 'Comercio', state.storesById.get(product.storeId)?.name || 'Sin asignar', () => openStorePicker()),
    infoRow('calculator', 'Precio de referencia', moneyOrDash(product.referencePrice), () => openProductForm(product)),
    infoRow('tag', 'Categoría', state.categoriesById.get(product.categoryId)?.name || 'Sin categoría', () => openProductForm(product)),
    infoRow('clock', 'Última vez comprado', product.lastPurchasedAt ? formatRelative(product.lastPurchasedAt) : 'Sin registro'),
    infoRow('calendar', 'Agregado', formatDate(product.createdAt)),
  ));

  return root;

  function infoRow(iconName, label, value, onClick = null) {
    const content = h('div.row', { style: { gap: '12px', padding: '11px 0', borderTop: '1px solid var(--line)' } },
      h('span.menu-item__icon', { style: { width: '34px', height: '34px' }, html: icon(iconName, { size: 17 }) }),
      h('div.grow', h('div.muted.small', label), h('div', { style: { fontWeight: 600 } }, value)),
      onClick ? h('span.chevron.muted', { html: icon('chevronRight', { size: 18 }) }) : null,
    );
    if (!onClick) return content;
    return h('button', {
      type: 'button',
      style: { display: 'block', width: '100%', background: 'transparent', border: 0, padding: 0, textAlign: 'left' },
      onclick: onClick,
    }, content);
  }

  async function setStatus(out_) {
    haptic();
    const previous = snapshotProduct(product);
    try {
      if (out_) {
        await markAsOut(product.id);
        toast('Pasó a la lista de compras', {
          type: 'warn',
          action: { label: 'Deshacer', onClick: () => restoreProductState(previous).catch(toastError) },
        });
      } else {
        await markAsPurchased(product.id);
        toast('Vuelve a estar disponible', {
          type: 'ok',
          action: { label: 'Deshacer', onClick: () => restoreProductState(previous).catch(toastError) },
        });
      }
    } catch (error) {
      toastError(error);
    }
  }

  async function joinList() {
    try {
      await addItem({ productId: product.id, name: product.name, quantity: 1, storeId: product.storeId, estimatedPrice: product.referencePrice });
      toastOk('Agregado a la lista de compras');
    } catch (error) { toastError(error); }
  }

  async function leaveList() {
    const item = state.shoppingList.find((i) => i.productId === product.id && i.status === 'pending');
    if (!item) return;
    try {
      await removeItem(item.id);
      toastOk('Quitado de la lista');
    } catch (error) { toastError(error); }
  }

  function openStorePicker() {
    const storeSelect = select(
      [{ value: '', label: 'Sin comercio' },
        ...[...state.stores].sort((a, b) => a.name.localeCompare(b.name, 'es')).map((s) => ({ value: s.id, label: s.name })),
        { value: NEW_STORE, label: '＋ Nuevo comercio…' }],
      product.storeId || '', {},
    );
    storeSelect.addEventListener('change', async () => {
      if (storeSelect.value !== NEW_STORE) return;
      storeSelect.value = product.storeId || '';
      const created = await openStoreForm();
      if (created) {
        storeSelect.insertBefore(h('option', { value: created.id }, created.name), storeSelect.options[storeSelect.options.length - 1]);
        storeSelect.value = created.id;
      }
    });

    openSheet({
      title: 'Comercio habitual',
      subtitle: `¿Dónde compras «${product.name}»?`,
      content: h('div',
        h('div.field', h('label.field__label', 'Comercio'), storeSelect),
        h('div.field__hint', 'Se usará para agrupar la lista de compras por comercio.'),
      ),
      actions: [
        { label: 'Cancelar', variant: 'btn-soft', onClick: () => {} },
        {
          label: 'Guardar',
          variant: 'btn-primary',
          onClick: async () => {
            try {
              await setStore(product.id, storeSelect.value === NEW_STORE ? product.storeId : storeSelect.value);
              toastOk('Comercio actualizado');
            } catch (error) { toastError(error); }
          },
        },
      ],
    });
  }

  async function removeProduct() {
    const ok = await confirmDialog({
      title: `¿Eliminar «${product.name}»?`,
      message: 'El producto saldrá del inventario y de la lista de compras.',
    });
    if (!ok) return;
    try {
      await deleteProduct(product.id);
      toastOk('Producto eliminado');
      ctx.go('/inventario');
    } catch (error) {
      toastError(error);
    }
  }
}
