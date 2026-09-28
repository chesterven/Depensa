/**
 * Alta y edición de un producto del hogar.
 * Lo esencial arriba (foto, nombre, categoría, ¿hay?, vencimiento) y el resto plegado.
 */
import { h } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { toNumber } from '../utils/format.js';
import { todayKey } from '../utils/date.js';
import { openSheet } from './ui/sheet.js';
import { toastOk, toastError } from './ui/toast.js';
import { field, input, moneyInput, select, textarea, segmented, chipRow, setFieldError } from './ui/form.js';
import { state, upsertProductLocal } from '../state.js';
import { createProduct, updateProduct } from '../api/products.js';
import { compressImage, uploadPhoto, removePhoto, photoUrl } from '../api/photos.js';
import { expiryPresets, findByName } from '../services/inventory.js';
import { openStoreForm } from './store-form.js';

const NEW_STORE = '__new__';

export function openProductForm(product = null, { defaults = {} } = {}) {
  return new Promise((resolve) => {
    const editing = !!product;
    let resolved = false;
    let categoryId = product?.categoryId ?? defaults.categoryId ?? null;
    let inStock = product ? product.inStock : (defaults.inStock ?? true);
    let tracksExpiry = product ? product.tracksExpiry : categoryTracksExpiry(categoryId);
    let photoBlob = null;
    let photoRemoved = false;

    /* ---- Foto ---- */
    const photoBox = h('div.photo-picker');
    const fileInput = h('input', {
      type: 'file', accept: 'image/*', capture: 'environment', class: 'sr-only', id: 'product-photo',
      onchange: async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        try {
          photoBlob = await compressImage(file);
          photoRemoved = false;
          showPhoto(URL.createObjectURL(photoBlob));
        } catch (error) {
          toastError(error, 'No se pudo procesar la imagen.');
        }
      },
    });

    function showPhoto(url) {
      photoBox.replaceChildren();
      if (url) {
        photoBox.append(
          h('img', { src: url, alt: 'Foto del producto' }),
          h('button.photo-picker__clear', {
            type: 'button', 'aria-label': 'Quitar foto',
            html: icon('close', { size: 16 }),
            onclick: () => { photoBlob = null; photoRemoved = true; showPhoto(null); },
          }),
        );
      } else {
        photoBox.append(h('label.photo-picker__empty', { for: 'product-photo' },
          h('span', { html: icon('camera', { size: 26 }) }),
          h('span.small', 'Agregar foto')));
      }
    }
    showPhoto(product?.photoPath ? photoUrl(product.photoPath) : null);

    /* ---- Campos ---- */
    const nameInput = input({
      id: 'product-name',
      name: 'name', value: product?.name || defaults.name || '',
      placeholder: 'Ej. Leche entera', autocomplete: 'off', required: true,
      'data-autofocus': editing ? null : '',
    });

    const categoryChips = h('div');
    function paintCategories() {
      categoryChips.replaceChildren(chipRow(
        [{ value: '', label: 'Sin categoría' },
          ...state.categories.map((c) => ({ value: c.id, label: c.name, icon: c.icon }))],
        categoryId || '',
        (value) => {
          categoryId = value || null;
          if (!editing) {
            tracksExpiry = categoryTracksExpiry(categoryId);
            paintExpiry();
          }
          paintCategories();
        },
      ));
    }
    paintCategories();

    const stockToggle = segmented(
      [{ value: 'in', label: 'Sí hay' }, { value: 'out', label: 'No hay' }],
      inStock ? 'in' : 'out',
      (value) => { inStock = value === 'in'; paintPurchased(); },
    );

    /* ---- Vencimiento ---- */
    const dateInput = input({ type: 'date', name: 'expiresOn', value: product?.expiresOn || '' });
    const presetRow = h('div.chip-row', { style: { marginTop: '8px' } },
      ...expiryPresets().map((preset) => h('button.chip', {
        type: 'button',
        onclick: () => { dateInput.value = preset.value; },
      }, preset.label)),
      h('button.chip', { type: 'button', onclick: () => { dateInput.value = ''; } }, 'Sin fecha'),
    );
    const expiryBody = h('div');
    const expirySwitch = h('button.switch', {
      type: 'button', role: 'switch', 'aria-checked': tracksExpiry ? 'true' : 'false',
      'aria-label': 'Este producto tiene fecha de vencimiento',
      onclick: () => {
        tracksExpiry = !tracksExpiry;
        paintExpiry();
      },
    });

    function paintExpiry() {
      expirySwitch.setAttribute('aria-checked', tracksExpiry ? 'true' : 'false');
      expiryBody.replaceChildren();
      if (tracksExpiry) {
        expiryBody.append(
          h('div.field__label', { style: { marginTop: '12px' } }, 'Fecha de vencimiento'),
          dateInput,
          presetRow,
        );
      }
    }
    paintExpiry();

    /* ---- Detalles opcionales ---- */
    const storeSelect = select(
      [{ value: '', label: 'Sin comercio' },
        ...[...state.stores].sort((a, b) => a.name.localeCompare(b.name, 'es')).map((s) => ({ value: s.id, label: s.name })),
        { value: NEW_STORE, label: '＋ Nuevo comercio…' }],
      product?.storeId || defaults.storeId || '', { name: 'storeId' },
    );
    storeSelect.addEventListener('change', async () => {
      if (storeSelect.value !== NEW_STORE) return;
      storeSelect.value = product?.storeId || '';
      const created = await openStoreForm();
      if (created) {
        storeSelect.insertBefore(h('option', { value: created.id }, created.name), storeSelect.options[storeSelect.options.length - 1]);
        storeSelect.value = created.id;
      }
    });

    /* ---- Fecha de compra (alimenta el promedio de «cuánto dura») ---- */
    const purchasedInput = input({
      type: 'date',
      name: 'purchasedOn',
      value: product?.purchasedOn || (editing ? '' : todayKey()),
      max: todayKey(),
    });
    const purchasedField = field('Fecha de compra', purchasedInput, {
      hint: 'Con esto la app calcula cuánto te dura. Si la dejas vacía, se usa el día que lo marques como comprado.',
    });
    // Solo aplica a lo que hay en casa: sin existencia no hay nada que contar
    function paintPurchased() { purchasedField.hidden = !inStock; }
    paintPurchased();

    const unitInput = input({ name: 'unit', value: product?.unit || '', placeholder: 'Ej. 1 litro, bolsa de 5 lb' });
    const priceWrap = moneyInput(state.household?.currencySymbol || '$', {
      name: 'referencePrice', value: product?.referencePrice ?? '', placeholder: 'Opcional',
    });
    const notesInput = textarea({ name: 'notes', value: product?.notes || '', rows: 2, placeholder: 'Marca preferida, dónde se guarda…' });

    const details = h('details.details',
      h('summary', 'Más detalles (comercio, presentación, precio)'),
      h('div.mt-1',
        purchasedField,
        field('Comercio donde se compra', storeSelect),
        field('Presentación', unitInput),
        field('Precio de referencia', priceWrap),
        field('Notas', notesInput),
      ),
    );

    const form = h('form', { onsubmit: (event) => event.preventDefault() },
      h('div.row', { style: { gap: '14px', alignItems: 'flex-start', marginBottom: '16px' } },
        photoBox,
        h('div.grow',
          h('label.field__label', { for: 'product-name' }, 'Nombre'),
          nameInput,
          h('label.btn.btn-soft.btn-sm.mt-1', { for: 'product-photo' },
            h('span', { html: icon('camera', { size: 16 }) }), 'Tomar foto'),
        ),
      ),
      fileInput,
      h('div.field',
        h('label.field__label', '¿Hay en casa?'),
        stockToggle),
      h('div.field',
        h('label.field__label', 'Categoría'),
        categoryChips),
      h('div.field',
        h('div.switch-row', { style: { borderBottom: 0, padding: '4px 0' } },
          h('div.switch-row__body',
            h('div.switch-row__title', 'Tiene fecha de vencimiento'),
            h('div.switch-row__hint', 'Actívalo para alimentos y medicinas')),
          expirySwitch),
        expiryBody),
      details,
    );

    openSheet({
      title: editing ? 'Editar producto' : 'Nuevo producto',
      subtitle: editing ? product.name : 'Registra algo de tu hogar',
      content: form,
      onClose: () => { if (!resolved) resolve(null); },
      actions: [
        { label: 'Cancelar', variant: 'btn-soft', onClick: () => { resolved = true; resolve(null); } },
        {
          label: editing ? 'Guardar' : 'Agregar',
          variant: 'btn-primary',
          keepOpen: true,
          onClick: async (api) => {
            const name = nameInput.value.trim();
            if (!name) {
              setFieldError(nameInput, 'Escribe el nombre del producto.');
              nameInput.focus();
              return false;
            }
            const duplicate = findByName(name);
            if (duplicate && duplicate.id !== product?.id) {
              setFieldError(nameInput, `Ya tienes «${duplicate.name}» registrado.`);
              return false;
            }
            setFieldError(nameInput, null);

            const payload = {
              name,
              categoryId: categoryId || null,
              storeId: storeSelect.value === NEW_STORE ? (product?.storeId || null) : (storeSelect.value || null),
              unit: unitInput.value.trim(),
              inStock,
              tracksExpiry,
              expiresOn: tracksExpiry && dateInput.value ? dateInput.value : null,
              referencePrice: priceWrap.querySelector('input').value === ''
                ? null : toNumber(priceWrap.querySelector('input').value, 0),
              notes: notesInput.value.trim(),
              // La fecha de compra describe la existencia actual: si no hay, no hay fecha
              purchasedOn: inStock ? (purchasedInput.value || null) : null,
            };

            api.setBusy(true);
            try {
              let saved = editing
                ? await updateProduct(product.id, payload)
                : await createProduct(state.household.id, payload);

              if (photoBlob) {
                const path = await uploadPhoto(state.household.id, saved.id, photoBlob);
                if (product?.photoPath) await removePhoto(product.photoPath);
                saved = await updateProduct(saved.id, { photoPath: path });
              } else if (photoRemoved && product?.photoPath) {
                await removePhoto(product.photoPath);
                saved = await updateProduct(saved.id, { photoPath: null });
              }

              upsertProductLocal(saved);
              toastOk(editing ? 'Producto actualizado' : `«${saved.name}» agregado`);
              resolved = true;
              resolve(saved);
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

function categoryTracksExpiry(categoryId) {
  return !!state.categoriesById.get(categoryId)?.tracksExpiry;
}

/**
 * Al marcar algo como comprado, si maneja vencimiento se ofrece anotar la fecha.
 * Devuelve la fecha elegida (o null) sin bloquear el flujo.
 */
export function askExpiryDate(product) {
  return new Promise((resolve) => {
    let resolved = false;
    const dateInput = input({ type: 'date', value: '', min: todayKey() });
    const done = (value) => { if (!resolved) { resolved = true; resolve(value); } };

    openSheet({
      title: '¿Hasta cuándo dura?',
      subtitle: product.name,
      dialog: true,
      content: (api) => h('div',
        h('p.muted.small', 'Anota la fecha de vencimiento para que la app te avise a tiempo.'),
        h('div.chip-row', { style: { marginBottom: '12px' } },
          ...expiryPresets().map((preset) => h('button.chip', {
            type: 'button',
            onclick: () => { done(preset.value); api.close(); },
          }, preset.label)),
        ),
        h('label.field__label', 'O elige la fecha'),
        dateInput,
      ),
      onClose: () => done(null),
      actions: [
        { label: 'Sin fecha', variant: 'btn-soft', onClick: () => done(null) },
        { label: 'Guardar', variant: 'btn-primary', onClick: () => done(dateInput.value || null) },
      ],
    });
  });
}
