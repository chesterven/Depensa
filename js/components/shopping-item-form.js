/** Alta y edición manual de elementos de la lista de compras. */
import { h } from '../utils/dom.js';
import { toNumber, money } from '../utils/format.js';
import { openSheet } from './ui/sheet.js';
import { toastOk, toastError } from './ui/toast.js';
import { field, input, numberInput, moneyInput, select, readForm, setFieldError } from './ui/form.js';
import { state } from '../state.js';
import { addItem, updateItem } from '../services/shopping-service.js';
import { bestStoreFor, suggestedPrice } from '../services/price-service.js';
import { openStoreForm } from './store-form.js';

const NEW_STORE = '__new__';

export function openShoppingItemForm(item = null) {
  return new Promise((resolve) => {
    let resolved = false;
    const editing = !!item;
    const products = [...state.products].sort((a, b) => a.name.localeCompare(b.name, 'es'));

    const nameInput = input({
      name: 'name',
      value: item?.name || '',
      placeholder: 'Escribe o elige un producto',
      list: 'shopping-product-list',
      autocomplete: 'off',
      'data-autofocus': '',
    });
    const datalist = h('datalist', { id: 'shopping-product-list' },
      ...products.map((p) => h('option', { value: p.name })));

    const quantityInput = numberInput({ name: 'quantity', value: item?.quantity ?? 1, min: '0.001' });
    const storeSelect = select(
      [{ value: '', label: 'Sin asignar' },
        ...[...state.stores].sort((a, b) => a.name.localeCompare(b.name, 'es')).map((s) => ({ value: s.id, label: s.name })),
        { value: NEW_STORE, label: '＋ Nuevo comercio…' }],
      item?.storeId || '',
      { name: 'storeId' },
    );
    const priceWrap = moneyInput(state.settings?.currency?.symbol || '$', {
      name: 'estimatedPrice', value: item?.estimatedPrice ?? '', placeholder: '0.00',
    });

    storeSelect.addEventListener('change', async () => {
      if (storeSelect.value === NEW_STORE) {
        storeSelect.value = '';
        const created = await openStoreForm();
        if (created) {
          storeSelect.insertBefore(h('option', { value: created.id }, created.name), storeSelect.options[storeSelect.options.length - 1]);
          storeSelect.value = created.id;
        }
      }
      const productId = item?.productId || state.products.find((p) => p.name.toLowerCase() === nameInput.value.trim().toLowerCase())?.id;
      if (productId && !priceWrap.querySelector('input').value) {
        const suggestion = suggestedPrice(productId, storeSelect.value || null);
        if (suggestion != null) priceWrap.querySelector('input').value = suggestion;
      }
    });

    nameInput.addEventListener('change', () => {
      const product = state.products.find((p) => p.name.toLowerCase() === nameInput.value.trim().toLowerCase());
      if (!product) return;
      const best = bestStoreFor(product.id);
      if (best && !storeSelect.value) storeSelect.value = best.storeId;
      const suggestion = suggestedPrice(product.id, storeSelect.value || null);
      const priceField = priceWrap.querySelector('input');
      if (suggestion != null && !priceField.value) priceField.value = suggestion;
    });

    const form = h('form', { onsubmit: (e) => e.preventDefault() },
      editing ? null : datalist,
      field('Producto', nameInput, { required: true, hint: editing ? '' : 'Si no existe, se creará en tu inventario.' }),
      h('div.form-row',
        field('Cantidad', quantityInput),
        field('Comercio', storeSelect),
      ),
      field('Precio estimado (unitario)', priceWrap, { hint: 'Se usa para calcular el presupuesto.' }),
    );

    openSheet({
      title: editing ? 'Editar artículo' : 'Agregar a la lista',
      content: form,
      onClose: () => { if (!resolved) resolve(null); },
      actions: [
        { label: 'Cancelar', variant: 'btn-soft', onClick: () => { resolved = true; resolve(null); } },
        {
          label: editing ? 'Guardar' : 'Agregar',
          variant: 'btn-primary',
          keepOpen: true,
          onClick: async (api) => {
            const values = readForm(form);
            const name = String(values.name || '').trim();
            if (!name) { setFieldError(nameInput, 'Escribe el nombre del producto.'); return false; }
            api.setBusy(true);
            try {
              if (editing) {
                await updateItem(item.id, {
                  name,
                  quantity: toNumber(values.quantity, 1),
                  storeId: values.storeId === NEW_STORE ? null : (values.storeId || null),
                  estimatedPrice: values.estimatedPrice === '' ? null : toNumber(values.estimatedPrice, 0),
                });
                toastOk('Artículo actualizado');
              } else {
                await addItem({
                  name,
                  quantity: toNumber(values.quantity, 1),
                  storeId: values.storeId === NEW_STORE ? null : (values.storeId || null),
                  estimatedPrice: values.estimatedPrice === '' ? null : toNumber(values.estimatedPrice, 0),
                });
                toastOk(`«${name}» agregado a la lista`);
              }
              resolved = true;
              resolve(true);
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

export { money };
