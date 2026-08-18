/** Alta y edición de comercios. */
import { h } from '../utils/dom.js';
import { openSheet } from './ui/sheet.js';
import { toastOk, toastError } from './ui/toast.js';
import { field, input, textarea, readForm, setFieldError } from './ui/form.js';
import { saveStore } from '../database/stores.js';
import { state, refresh } from '../state.js';
import { normalize } from '../utils/format.js';

export function openStoreForm(store = null) {
  return new Promise((resolve) => {
    let resolved = false;
    const nameInput = input({ name: 'name', value: store?.name || '', placeholder: 'Ej. Supermercado A', 'data-autofocus': '' });
    const addressInput = input({ name: 'address', value: store?.address || '', placeholder: 'Opcional' });
    const notesInput = textarea({ name: 'notes', value: store?.notes || '', placeholder: 'Horarios, días de oferta…' });

    const form = h('form', { onsubmit: (e) => e.preventDefault() },
      field('Nombre', nameInput, { required: true }),
      field('Dirección', addressInput),
      field('Notas', notesInput),
    );

    openSheet({
      title: store ? 'Editar comercio' : 'Nuevo comercio',
      content: form,
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
            if (!name) { setFieldError(nameInput, 'Escribe el nombre del comercio.'); return false; }
            const duplicate = state.stores.find((s) => normalize(s.name) === normalize(name) && s.id !== store?.id);
            if (duplicate) { setFieldError(nameInput, 'Ese comercio ya existe.'); return false; }
            try {
              const record = await saveStore({ ...(store || {}), name, address: values.address, notes: values.notes });
              await refresh(['stores']);
              toastOk(store ? 'Comercio actualizado' : 'Comercio agregado');
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
