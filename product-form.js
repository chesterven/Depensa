/** Formulario de producto (crear / editar) dentro de un bottom sheet. */
import { h } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { toNumber } from '../utils/format.js';
import { openSheet } from './ui/sheet.js';
import { toastOk, toastError } from './ui/toast.js';
import { field, input, moneyInput, select, textarea, segmented, readForm, setFieldError } from './ui/form.js';
import { UNIT_SUGGESTIONS, STATUS } from '../database/products.js';
import { getPhoto, savePhoto, deletePhoto, compressImage } from '../database/photos.js';
import { state, refresh } from '../state.js';
import { saveProduct, findProductByName } from '../services/inventory-service.js';
import { openCategoryForm } from './category-form.js';
import { openStoreForm } from './store-form.js';

const NEW_CATEGORY = '__new__';
const NEW_STORE = '__new__';

export function openProductForm(product = null, { defaults = {} } = {}) {
  return new Promise((resolve) => {
    let pendingPhoto = null;      // data URL nuevo
    let removePhoto = false;
    let status = product?.status === STATUS.OUT ? STATUS.OUT : (defaults.status || STATUS.AVAILABLE);
    let resolved = false;

    const nameInput = input({
      name: 'name',
      value: product?.name || defaults.name || '',
      placeholder: 'Ej. Leche entera',
      autocomplete: 'off',
      required: true,
      'data-autofocus': product ? null : '',
    });

    const categorySelect = select(
      [{ value: '', label: 'Sin categoría' },
        ...state.categories.map((c) => ({ value: c.id, label: c.name })),
        { value: NEW_CATEGORY, label: '＋ Nueva categoría…' }],
      product?.categoryId || defaults.categoryId || '',
      { name: 'categoryId' },
    );

    const storeSelect = select(
      [{ value: '', label: 'Sin comercio' },
        ...[...state.stores].sort((a, b) => a.name.localeCompare(b.name, 'es')).map((s) => ({ value: s.id, label: s.name })),
        { value: NEW_STORE, label: '＋ Nuevo comercio…' }],
      product?.storeId || defaults.storeId || '',
      { name: 'storeId' },
    );

    const unitInput = input({
      name: 'unit',
      value: product?.unit || '',
      placeholder: 'Ej. 1 litro, bolsa de 5 lb',
      list: 'unit-suggestions',
      autocomplete: 'off',
    });
    const unitList = h('datalist', { id: 'unit-suggestions' }, ...UNIT_SUGGESTIONS.map((u) => h('option', { value: u })));

    const priceWrap = moneyInput(state.settings?.currency?.symbol || '$', {
      name: 'referencePrice',
      value: product?.referencePrice ?? '',
      placeholder: 'Opcional',
    });

    const notesInput = textarea({ name: 'notes', value: product?.notes || '', placeholder: 'Marca preferida, tamaño, recordatorios…' });

    categorySelect.addEventListener('change', async () => {
      if (categorySelect.value !== NEW_CATEGORY) return;
      categorySelect.value = product?.categoryId || '';
      const created = await openCategoryForm();
      if (created) {
        categorySelect.insertBefore(h('option', { value: created.id }, created.name), categorySelect.options[categorySelect.options.length - 1]);
        categorySelect.value = created.id;
      }
    });

    storeSelect.addEventListener('change', async () => {
      if (storeSelect.value !== NEW_STORE) return;
      storeSelect.value = product?.storeId || '';
      const created = await openStoreForm();
      if (created) {
        storeSelect.insertBefore(h('option', { value: created.id }, created.name), storeSelect.options[storeSelect.options.length - 1]);
        storeSelect.value = created.id;
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

    const form = h('form', { onsubmit: (event) => event.preventDefault() },
      h('div.row', { style: { marginBottom: '16px' } },
        preview,
        h('div.grow',
          h('label.btn.btn-soft.btn-sm', { for: 'product-photo-input' },
            h('span', { html: icon('camera', { size: 17 }) }), 'Foto (opcional)'),
          removeButton,
          h('div.field__hint', 'Se guarda comprimida en este dispositivo.'),
        ),
        fileInput,
      ),
      field('Nombre', nameInput, { required: true }),
      h('div.field',
        h('label.field__label', 'Estado'),
        segmented([
          { value: STATUS.AVAILABLE, label: 'Hay existencia' },
          { value: STATUS.OUT, label: 'Agotado' },
        ], status, (value) => { status = value; }),
        h('div.field__hint', 'Si lo marcas agotado pasará automáticamente a la lista de compras.'),
      ),
      field('Comercio donde se compra', storeSelect),
      field('Categoría', categorySelect),
      h('div.form-row',
        field('Presentación', unitInput),
        field('Precio de referencia', priceWrap),
      ),
      unitList,
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
                status,
                categoryId: values.categoryId === NEW_CATEGORY ? (product?.categoryId || null) : (values.categoryId || null),
                storeId: values.storeId === NEW_STORE ? (product?.storeId || null) : (values.storeId || null),
                unit: values.unit || '',
                referencePrice: values.referencePrice === '' ? null : toNumber(values.referencePrice, 0),
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
