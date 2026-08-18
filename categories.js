/** Administración de categorías. */
import { h } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';
import { plural } from '../../utils/format.js';
import { state, refresh } from '../../state.js';
import { deleteCategory } from '../../database/categories.js';
import { saveProduct } from '../../database/products.js';
import { emptyState } from '../ui/empty.js';
import { openSheet } from '../ui/sheet.js';
import { confirmDialog } from '../ui/confirm.js';
import { toastOk, toastError } from '../ui/toast.js';
import { openCategoryForm } from '../category-form.js';

export function render(ctx) {
  ctx.setHeader({
    title: 'Categorías',
    subtitle: plural(state.categories.length, 'categoría', 'categorías'),
    back: true,
    actions: [{ iconName: 'plus', label: 'Nueva categoría', onClick: () => openCategoryForm() }],
  });
  ctx.onState(() => ctx.refresh());

  const root = h('div');

  if (!state.categories.length) {
    root.appendChild(emptyState({
      iconName: 'tag',
      title: 'Sin categorías',
      text: 'Las categorías te ayudan a filtrar el inventario y a ver en qué gastas más.',
      actionLabel: 'Crear categoría',
      onAction: () => openCategoryForm(),
    }));
    return root;
  }

  const list = h('div.list');
  state.categories.forEach((category) => {
    const count = state.products.filter((product) => product.categoryId === category.id).length;
    list.appendChild(h('button.tile', { type: 'button', onclick: () => openActions(category, count) },
      h('div.thumb', { style: { background: `${category.color}22`, color: category.color }, html: icon(category.icon || 'tag', { size: 20 }) }),
      h('div.tile__body',
        h('div.tile__title', category.name),
        h('div.tile__meta', plural(count, 'producto')),
      ),
      h('span.chevron.muted', { html: icon('chevronRight', { size: 18 }) }),
    ));
  });
  root.appendChild(list);

  root.appendChild(h('button.fab', { type: 'button', onclick: () => openCategoryForm() },
    h('span', { html: icon('plus', { size: 21 }) }), 'Categoría'));

  return root;

  function openActions(category, count) {
    openSheet({
      title: category.name,
      subtitle: plural(count, 'producto'),
      dialog: true,
      content: (api) => h('div.menu-list',
        h('button.menu-item', { type: 'button', onclick: () => { api.close(); openCategoryForm(category); } },
          h('span.menu-item__icon', { html: icon('pencil', { size: 18 }) }),
          h('div.menu-item__body', h('div.menu-item__title', 'Editar categoría'))),
        h('button.menu-item', { type: 'button', onclick: () => { api.close(); ctx.go(`/inventario?category=${category.id}`); } },
          h('span.menu-item__icon', { html: icon('box', { size: 18 }) }),
          h('div.menu-item__body', h('div.menu-item__title', 'Ver productos'))),
        h('button.menu-item', {
          type: 'button',
          onclick: async () => {
            api.close();
            const ok = await confirmDialog({
              title: `¿Eliminar «${category.name}»?`,
              message: count
                ? `${count} productos quedarán sin categoría.`
                : 'Esta categoría no tiene productos asignados.',
            });
            if (!ok) return;
            try {
              const affected = state.products.filter((product) => product.categoryId === category.id);
              for (const product of affected) await saveProduct({ ...product, categoryId: null });
              await deleteCategory(category.id);
              await refresh(['categories', 'products']);
              toastOk('Categoría eliminada');
            } catch (error) { toastError(error); }
          },
        },
        h('span.menu-item__icon', { style: { color: 'var(--danger)' }, html: icon('trash', { size: 18 }) }),
        h('div.menu-item__body', h('div.menu-item__title', 'Eliminar categoría'))),
      ),
    });
  }
}
