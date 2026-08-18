/** Administración de comercios. */
import { h } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';
import { plural, initials, money } from '../../utils/format.js';
import { state, refresh } from '../../state.js';
import { deleteStore } from '../../database/stores.js';
import { saveProduct } from '../../database/products.js';
import { isOut } from '../../services/inventory-service.js';
import { emptyState } from '../ui/empty.js';
import { openSheet } from '../ui/sheet.js';
import { confirmDialog } from '../ui/confirm.js';
import { toastOk, toastError } from '../ui/toast.js';
import { openStoreForm } from '../store-form.js';

export function render(ctx) {
  ctx.setHeader({
    title: 'Comercios',
    subtitle: plural(state.stores.length, 'comercio'),
    back: true,
    actions: [{ iconName: 'plus', label: 'Nuevo comercio', onClick: () => openStoreForm() }],
  });
  ctx.onState(() => ctx.refresh());

  const root = h('div');

  if (!state.stores.length) {
    root.appendChild(emptyState({
      iconName: 'store',
      title: 'Sin comercios registrados',
      text: 'Agrega los lugares donde compras para saber dónde conseguir cada producto.',
      actionLabel: 'Agregar comercio',
      onAction: () => openStoreForm(),
    }));
    return root;
  }

  const stats = new Map();
  for (const product of state.products) {
    if (!product.storeId) continue;
    const entry = stats.get(product.storeId) || { total: 0, out: 0, value: 0 };
    entry.total += 1;
    if (isOut(product)) entry.out += 1;
    if (product.referencePrice != null) entry.value += Number(product.referencePrice) || 0;
    stats.set(product.storeId, entry);
  }

  const list = h('div.list');
  [...state.stores]
    .sort((a, b) => (stats.get(b.id)?.total || 0) - (stats.get(a.id)?.total || 0) || a.name.localeCompare(b.name, 'es'))
    .forEach((store) => {
      const row = stats.get(store.id);
      list.appendChild(h('button.tile', { type: 'button', onclick: () => openActions(store, row) },
        h('div.thumb', initials(store.name)),
        h('div.tile__body',
          h('div.tile__title', store.name),
          h('div.tile__meta', [
            row ? plural(row.total, 'producto') : 'Sin productos',
            row?.out ? `${row.out} por comprar` : null,
            store.address || null,
          ].filter(Boolean).join(' · ')),
        ),
        h('span.chevron.muted', { html: icon('chevronRight', { size: 18 }) }),
      ));
    });
  root.appendChild(list);

  const orphans = state.products.filter((p) => !p.storeId).length;
  if (orphans) {
    root.appendChild(h('div.notice.mt-2',
      h('span', { html: icon('info', { size: 18 }) }),
      h('span.grow', `${plural(orphans, 'producto')} sin comercio asignado.`)));
  }

  root.appendChild(h('button.fab', { type: 'button', onclick: () => openStoreForm() },
    h('span', { html: icon('plus', { size: 21 }) }), 'Comercio'));

  return root;

  function openActions(store, row) {
    openSheet({
      title: store.name,
      subtitle: row ? `${plural(row.total, 'producto')}${row.value ? ` · ${money(row.value)} de referencia` : ''}` : 'Sin productos asignados',
      dialog: true,
      content: (api) => h('div',
        store.notes ? h('p.muted.small', store.notes) : null,
        h('div.menu-list',
          h('button.menu-item', { type: 'button', onclick: () => { api.close(); openStoreForm(store); } },
            h('span.menu-item__icon', { html: icon('pencil', { size: 18 }) }),
            h('div.menu-item__body', h('div.menu-item__title', 'Editar comercio'))),
          h('button.menu-item', { type: 'button', onclick: () => { api.close(); ctx.go(`/inventario?store=${store.id}`); } },
            h('span.menu-item__icon', { html: icon('box', { size: 18 }) }),
            h('div.menu-item__body', h('div.menu-item__title', 'Ver sus productos'))),
          h('button.menu-item', {
            type: 'button',
            onclick: async () => {
              api.close();
              const affected = state.products.filter((p) => p.storeId === store.id);
              const ok = await confirmDialog({
                title: `¿Eliminar «${store.name}»?`,
                message: affected.length
                  ? `${plural(affected.length, 'producto')} quedarán sin comercio asignado.`
                  : 'Este comercio no tiene productos asignados.',
              });
              if (!ok) return;
              try {
                for (const product of affected) await saveProduct({ ...product, storeId: null });
                await deleteStore(store.id);
                await refresh(['stores', 'products']);
                toastOk('Comercio eliminado');
              } catch (error) { toastError(error); }
            },
          },
          h('span.menu-item__icon', { style: { color: 'var(--danger)' }, html: icon('trash', { size: 18 }) }),
          h('div.menu-item__body', h('div.menu-item__title', 'Eliminar comercio'))),
        ),
      ),
    });
  }
}
