/** Formulario de producto (crear / editar) dentro de un bottom sheet. */
import { h } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { toNumber, normalize } from '../utils/format.js';
import { openSheet } from './ui/sheet.js';
import { toastOk, toastError } from './ui/toast.js';
import { field, input, numberInput, select, textarea, readForm, setFieldError } from './ui/form.js';
import { UNITS } from '../database/products.js';
import { getPhoto, savePhoto, deletePhoto, compressImage } from '../database/photos.js';
import { state, refresh } from '../state.js';
import { saveProduct, findProductByName } from '../services/inventory-service.js';
import { openCategoryForm } from './category-form.js';

const NEW_CATEGORY = '__new__';

export function openProductForm(product = null, { defaults = {} } = {}) {
  return new Promise((resolve) => {
    let pendingPhoto = null;      // data URL nuevo
    let removePhoto = false;
    let resolved = false;

    const nameInput = input({ name: 'name', value: product?.name || defaults.name || '', placeholder: 'Ej. Leche entera', autocomplete: 'off', required: true, 'data-autofocus': product ? null : '' });
    const categorySelect = select(
      [{ value: '', label: 'Sin categoría' },
        ...state.categories.map((c) => ({ value: c.id, label: c.name })),
        { value: NEW_CATEGORY, label: '＋ Nueva categoría…' }],
      product?.categoryId || defaults.categoryId || '',
      { name: 'categoryId' },
    );
    const unitSelect = select(UNITS.map((u) => ({ value: u, label: u })), product?.unit || 'unidad', { name: 'unit' });
    const currentInput = numberInput({ name: 'currentQuantity', value: product ? product.currentQuantity : (defaults.currentQuantity ?? 1) });
    const minimumInput = numberInput({ name: 'minimumQuantity', value: product ? product.minimumQuantity : (defaults.minimumQuantity ?? 1) });
    const notesInput = textarea({ name: 'notes', value: product?.notes || '', placeholder: 'Marca preferida, tamaño, recordatorios…' });

    categorySelect.addEventListener('change', async () => {
      if (categorySelect.value !== NEW_CATEGORY) return;
      categorySelect.value = product?.categoryId || '';
      const created = await openCategoryForm();
      if (created) {
        const option = h('option', { value: created.id }, created.name);
        categorySelect.insertBefore(option, categorySelect.options[categorySelect.options.length - 1]);
        categorySelect.value = created.id;
      }
    });

    /* ---- Fotografía ---- */
    const preview = h('div.thumb.thumb--lg', { html: icon('camera', { size: 24 }) });
    const fileInput = h('input', {
      type: 'file', accept: 'image/*', capture: 'environment',
      class: 'sr-only', id: 'product-photo-input',
      onchange: async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
          pendingPhoto = await compressImage(file);
          removePhoto = false;
          showPhoto(pendingPhoto);
        } catch (error) {
          toastError(error, 'No se pudo procesar la imagen.');
        }
        event.target.value = '';
      },
    });
    const removeButton = h('button.btn.btn-ghost.btn-sm', {
      type: 'button',
      style: { display: 'none' },
      onclick: () => { pendingPhoto = null; removePhoto = true; showPhoto(null); },
    }, 'Quitar');

    function showPhoto(dataUrl) {
      preview.replaceChildren();
      if (dataUrl) {
        preview.appendChild(h('img', { src: dataUrl, alt: 'Fotografía del producto' }));
        removeButton.style.display = '';
      } else {
        preview.innerHTML = icon('camera', { size: 24 });
        removeButton.style.display = 'none';
      }
    }

    if (product?.hasPhoto) {
      getPhoto(product.id).then((photo) => { if (photo?.dataUrl && !removePhoto) showPhoto(photo.dataUrl); }).catch(() => {});
    }

    const photoRow = h('div.row', { style: { marginBottom: '16px' } },
      preview,
      h('div.grow',
        h('label.btn.btn-soft.btn-sm', { for: 'product-photo-input' },
          h('span', { html: icon('camera', { size: 17 }) }), 'Foto (opcional)'),
        removeButton,
        h('div.field__hint', 'Se guarda comprimida en este dispositivo.'),
      ),
      fileInput,
    );

    const form = h('form', { onsubmit: (event) => event.preventDefault() },
      photoRow,
      field('Nombre', nameInput, { required: true }),
      field('Categoría', categorySelect),
      field('Unidad de medida', unitSelect),
      h('div.form-row',
        field('Cantidad actual', currentInput),
        field('Cantidad mínima', minimumInput, { hint: 'Aviso al llegar aquí' }),
      ),
      field('Notas', notesInput),
    );

    openSheet({
      title: product ? 'Editar producto' : 'Nuevo producto',
      subtitle: product ? product.name : 'Agrega un producto a tu inventario',
      content: form,
      onClose: () => { if (!resolved) resolve(null); },
      actions: [
        { label: 'Cancelar', variant: 'btn-soft', onClick: () => { resolved = true; resolve(null); } },
        {
          label: product ? 'Guardar cambios' : 'Crear producto',
          variant: 'btn-primary',
          keepOpen: true,
          onClick: async (api) => {
            const values = readForm(form);
            const name = String(values.name || '').trim();
            if (!name) {
              setFieldError(nameInput, 'Escribe un nombre para el producto.');
              nameInput.focus();
              return false;
            }
            const duplicate = findProductByName(name);
            if (duplicate && duplicate.id !== product?.id) {
              setFieldError(nameInput, `Ya existe un producto llamado «${duplicate.name}».`);
              return false;
            }
            setFieldError(nameInput, null);
            api.setBusy(true);
            try {
              const record = await saveProduct({
                ...(product || {}),
                name,
                categoryId: values.categoryId === NEW_CATEGORY ? (product?.categoryId || null) : (values.categoryId || null),
                unit: values.unit,
                currentQuantity: toNumber(values.currentQuantity, 0),
                minimumQuantity: toNumber(values.minimumQuantity, 0),
                notes: values.notes || '',
                hasPhoto: pendingPhoto ? true : (removePhoto ? false : !!product?.hasPhoto),
              });
              if (pendingPhoto) await savePhoto(record.id, pendingPhoto);
              if (removePhoto && product?.hasPhoto) await deletePhoto(record.id);
              await refresh(['products']);
              toastOk(product ? 'Producto actualizado' : `«${record.name}» agregado al inventario`);
              resolved = true;
              resolve(record);
              api.close();
            } catch (error) {
              toastError(error, 'No se pudo guardar el producto.');
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

export { normalize };
