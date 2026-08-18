/** Alta y edición de categorías. */
import { h } from '../utils/dom.js';
import { openSheet } from './ui/sheet.js';
import { toastOk, toastError } from './ui/toast.js';
import { field, input, select, readForm, setFieldError } from './ui/form.js';
import { saveCategory } from '../database/categories.js';
import { state, refresh } from '../state.js';
import { normalize } from '../utils/format.js';
import { ICON_NAMES } from '../utils/icons.js';

const COLORS = ['#2F7D5B', '#2A7EA8', '#7A6BC4', '#C2557F', '#B4762A', '#C0602F', '#3E8E7E', '#6C7684'];
const ICONS = ['tag', 'jar', 'drop', 'sparkles', 'cart', 'scale', 'shield', 'star', 'box', 'store'].filter((n) => ICON_NAMES.includes(n));

export function openCategoryForm(category = null) {
  return new Promise((resolve) => {
    let resolved = false;
    const nameInput = input({ name: 'name', value: category?.name || '', placeholder: 'Ej. Congelados', 'data-autofocus': '' });
    const iconSelect = select(ICONS.map((i) => ({ value: i, label: i })), category?.icon || 'tag', { name: 'icon' });
    const colorSelect = select(COLORS.map((c) => ({ value: c, label: c })), category?.color || COLORS[0], { name: 'color' });

    const form = h('form', { onsubmit: (e) => e.preventDefault() },
      field('Nombre', nameInput, { required: true }),
      h('div.form-row', field('Icono', iconSelect), field('Color', colorSelect)),
    );

    openSheet({
      title: category ? 'Editar categoría' : 'Nueva categoría',
      content: form,
      dialog: true,
      onClose: () => { if (!resolved) resolve(null); },
      actions: [
        { label: 'Cancelar', variant: 'btn-soft', onClick: () => { resolved = true; resolve(null); } },
        {
          label: 'Guardar',
          variant: 'btn-primary',
          keepOpen: true,
          onClick: async (api) => {
            const values = readForm(form);
            const name = String(values.name || '').trim();
            if (!name) { setFieldError(nameInput, 'Escribe un nombre.'); return false; }
            const duplicate = state.categories.find((c) => normalize(c.name) === normalize(name) && c.id !== category?.id);
            if (duplicate) { setFieldError(nameInput, 'Ya existe una categoría con ese nombre.'); return false; }
            try {
              const record = await saveCategory({ ...(category || {}), name, icon: values.icon, color: values.color });
              await refresh(['categories']);
              toastOk(category ? 'Categoría actualizada' : 'Categoría creada');
              resolved = true;
              resolve(record);
              api.close();
            } catch (error) {
              toastError(error);
              return false;
            }
            return true;
          },
        },
      ],
    });
  });
}
