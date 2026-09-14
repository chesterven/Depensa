/** Alta y edición de comercios. */
import { h } from '../utils/dom.js';
import { openSheet } from './ui/sheet.js';
import { toastOk, toastError } from './ui/toast.js';
import { field, input, textarea, setFieldError } from './ui/form.js';
import { state, setCatalogLocal } from '../state.js';
import { saveStore, listStores } from '../api/catalog.js';
import { normalize } from '../utils/format.js';

export function openStoreForm(store = null) {
  return new Promise((resolve) => {
    let resolved = false;
    const nameInput = input({ name: 'name', value: store?.name || '', placeholder: 'Ej. Supermercado A', 'data-autofocus': '' });
    const notesInput = textarea({ name: 'notes', value: store?.notes || '', rows: 2, placeholder: 'Horarios, ubicación…' });

    const form = h('form', { onsubmit: (e) => e.preventDefault() },
      field('Nombre', nameInput, { required: true }),
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
            const name = nameInput.value.trim();
            if (!name) { setFieldError(nameInput, 'Escribe el nombre.'); return false; }
            const duplicate = state.stores.find((s) => normalize(s.name) === normalize(name) && s.id !== store?.id);
            if (duplicate) { setFieldError(nameInput, 'Ese comercio ya existe.'); return false; }
            api.setBusy(true);
            try {
              const saved = await saveStore(state.household.id, { ...(store || {}), name, notes: notesInput.value.trim() });
              setCatalogLocal({ stores: await listStores(state.household.id) });
              toastOk(store ? 'Comercio actualizado' : 'Comercio agregado');
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
