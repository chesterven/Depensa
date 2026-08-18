/** Administración de comercios. */
import { h } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';
import { money, plural, initials } from '../../utils/format.js';
import { state, refresh } from '../../state.js';
import { deleteStore } from '../../database/stores.js';
import { byStore } from '../../services/stats-service.js';
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
  const spending = new Map(byStore(state.purchases).map((row) => [row.id, row]));

  if (!state.stores.length) {
    root.appendChild(emptyState({
      iconName: 'store',
      title: 'Sin comercios registrados',
      text: 'Agrega los lugares donde compras para poder comparar precios entre ellos.',
      actionLabel: 'Agregar comercio',
      onAction: () => openStoreForm(),
    }));
    return root;
  }

  const list = h('div.list');
  [...state.stores]
    .sort((a, b) => (spending.get(b.id)?.value || 0) - (spending.get(a.id)?.value || 0))
    .forEach((store) => {
      const row = spending.get(store.id);
      list.appendChild(h('button.tile', { type: 'button', onclick: () => openActions(store, row) },
        h('div.thumb', initials(store.name)),
        h('div.tile__body',
          h('div.tile__title', store.name),
          h('div.tile__meta', store.address || 'Sin dirección', row ? h('span', ` · ${plural(row.count, 'compra')}`) : null),
        ),
        h('div.tile__right', h('div.tile__price', money(row?.value || 0))),
      ));
    });
  root.appendChild(list);

  root.appendChild(h('button.fab', { type: 'button', onclick: () => openStoreForm() },
    h('span', { html: icon('plus', { size: 21 }) }), 'Comercio'));

  return root;

  function openActions(store, row) {
    openSheet({
      title: store.name,
      subtitle: row ? `${plural(row.count, 'compra')} · ${money(row.value)}` : 'Sin compras registradas',
      dialog: true,
      content: (api) => h('div',
        store.notes ? h('p.muted.small', store.notes) : null,
        h('div.menu-list',
          h('button.menu-item', { type: 'button', onclick: () => { api.close(); openStoreForm(store); } },
            h('span.menu-item__icon', { html: icon('pencil', { size: 18 }) }),
            h('div.menu-item__body', h('div.menu-item__title', 'Editar comercio'))),
          h('button.menu-item', { type: 'button', onclick: () => { api.close(); ctx.go(`/compras?store=${store.id}`); } },
            h('span.menu-item__icon', { html: icon('receipt', { size: 18 }) }),
            h('div.menu-item__body', h('div.menu-item__title', 'Ver compras'))),
          h('button.menu-item', {
            type: 'button',
            onclick: async () => {
              api.close();
              const ok = await confirmDialog({
                title: `¿Eliminar «${store.name}»?`,
                message: 'Dejará de aparecer al registrar compras.',
                detail: 'Las compras ya registradas conservan el nombre del comercio en el historial.',
              });
              if (!ok) return;
              try {
                await deleteStore(store.id);
                await refresh(['stores']);
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
