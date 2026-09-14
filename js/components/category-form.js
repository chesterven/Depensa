/** Alta y edición de categorías del hogar. */
import { h } from '../utils/dom.js';
import { openSheet } from './ui/sheet.js';
import { toastOk, toastError } from './ui/toast.js';
import { field, input, switchRow, setFieldError } from './ui/form.js';
import { state, setCatalogLocal } from '../state.js';
import { saveCategory, listCategories } from '../api/catalog.js';
import { normalize } from '../utils/format.js';
import { icon, ICON_NAMES } from '../utils/icons.js';

const COLORS = ['#2F7D5B', '#2A7EA8', '#7A6BC4', '#C2557F', '#B4762A', '#C0602F', '#3E8E7E', '#6C7684', '#D2789B'];
const ICONS = ['tag', 'jar', 'drop', 'sparkles', 'shield', 'heart', 'star', 'scale', 'cart', 'box'].filter((n) => ICON_NAMES.includes(n));

export function openCategoryForm(category = null) {
  return new Promise((resolve) => {
    let resolved = false;
    let selectedIcon = category?.icon || 'tag';
    let selectedColor = category?.color || COLORS[0];
    let tracksExpiry = !!category?.tracksExpiry;

    const nameInput = input({ name: 'name', value: category?.name || '', placeholder: 'Ej. Congelados', 'data-autofocus': '' });

    const iconRow = h('div.chip-row');
    const colorRow = h('div.chip-row');

    function paint() {
      iconRow.replaceChildren(...ICONS.map((name) => h('button', {
        type: 'button',
        class: `chip${name === selectedIcon ? ' is-active' : ''}`,
        'aria-label': `Icono ${name}`,
        onclick: () => { selectedIcon = name; paint(); },
        html: icon(name, { size: 18 }),
      })));
      colorRow.replaceChildren(...COLORS.map((color) => h('button', {
        type: 'button',
        class: `swatch${color === selectedColor ? ' is-active' : ''}`,
        style: { background: color },
        'aria-label': `Color ${color}`,
        onclick: () => { selectedColor = color; paint(); },
      })));
    }
    paint();

    const form = h('form', { onsubmit: (e) => e.preventDefault() },
      field('Nombre', nameInput, { required: true }),
      h('div.field', h('label.field__label', 'Icono'), iconRow),
      h('div.field', h('label.field__label', 'Color'), colorRow),
      switchRow({
        title: 'Sus productos vencen',
        hint: 'Activa la fecha de vencimiento por defecto (alimentos, medicinas…)',
        checked: tracksExpiry,
        onChange: (value) => { tracksExpiry = value; },
      }),
    );

    openSheet({
      title: category ? 'Editar categoría' : 'Nueva categoría',
      content: form,
      onClose: () => { if (!resolved) resolve(null); },
      actions: [
        { label: 'Cancelar', variant: 'btn-soft', onClick: () => { resolved = true; resolve(null); } },
        {
          label: 'Guardar',
          variant: 'btn-primary',
          keepOpen: true,
          onClick: async (api) => {
            const name = nameInput.value.trim();
            if (!name) { setFieldError(nameInput, 'Escribe un nombre.'); return false; }
            const duplicate = state.categories.find((c) => normalize(c.name) === normalize(name) && c.id !== category?.id);
            if (duplicate) { setFieldError(nameInput, 'Ya existe una categoría con ese nombre.'); return false; }
            api.setBusy(true);
            try {
              const saved = await saveCategory(state.household.id, {
                ...(category || {}), name, icon: selectedIcon, color: selectedColor, tracksExpiry,
              });
              setCatalogLocal({ categories: await listCategories(state.household.id) });
              toastOk(category ? 'Categoría actualizada' : 'Categoría creada');
              resolved = true;
              resolve(saved);
              api.close();
            } catch (error) {
              toastError(error);
              api.setBusy(false);
              return false;
            }
            return true;
          },
        },
      ],
    });
  });
}
