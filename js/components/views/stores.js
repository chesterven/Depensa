/** Comercios del hogar. */
import { h } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';
import { plural, initials } from '../../utils/format.js';
import { state, setCatalogLocal } from '../../state.js';
import { deleteStore, listStores } from '../../api/catalog.js';
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
      title: 'Sin comercios',
      text: 'Registra dónde compras cada producto para ordenar la lista por tienda.',
      actionLabel: 'Agregar comercio',
      onAction: () => openStoreForm(),
    }));
    return root;
  }

  const list = h('div.list');
  [...state.stores].forEach((store) => {
    const products = state.products.filter((p) => p.storeId === store.id);
    const missing = products.filter((p) => !p.inStock).length;
    list.appendChild(h('button.tile', { type: 'button', onclick: () => openActions(store, products.length, missing) },
      h('div.thumb', initials(store.name)),
      h('div.tile__body',
        h('div.tile__title', h('span.truncate', store.name)),
        h('div.tile__meta', [plural(products.length, 'producto'), missing ? `faltan ${missing}` : null].filter(Boolean).join(' · ')),
      ),
      h('span.chevron.muted', { html: icon('chevronRight', { size: 18 }) }),
    ));
  });
  root.appendChild(list);

  root.appendChild(h('button.fab', { type: 'button', onclick: () => openStoreForm() },
    h('span', { html: icon('plus', { size: 21 }) }), 'Comercio'));

  return root;

  function openActions(store, total, missing) {
    openSheet({
      title: store.name,
      subtitle: `${plural(total, 'producto')}${missing ? ` · faltan ${missing}` : ''}`,
      dialog: true,
      content: (api) => h('div',
        store.notes ? h('p.muted.small', store.notes) : null,
        h('div.menu-list',
          h('button.menu-item', { type: 'button', onclick: () => { api.close(); openStoreForm(store); } },
            h('span.menu-item__icon', { html: icon('pencil', { size: 18 }) }),
            h('div.menu-item__body', h('div.menu-item__title', 'Editar comercio'))),
          h('button.menu-item', {
            type: 'button',
            onclick: async () => {
              api.close();
              const ok = await confirmDialog({
                title: `¿Eliminar «${store.name}»?`,
                message: total ? `${plural(total, 'producto')} quedarán sin comercio.` : 'No tiene productos asignados.',
              });
              if (!ok) return;
              try {
                await deleteStore(store.id);
                setCatalogLocal({ stores: await listStores(state.household.id) });
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
