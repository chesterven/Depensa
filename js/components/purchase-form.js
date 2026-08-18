/**
 * Registro rápido de una compra.
 * Flujo: producto -> cantidad -> comercio -> precio -> guardar.
 */
import { h } from '../utils/dom.js';
import { icon } from '../utils/icons.js';
import { money, toNumber, round, qty as fmtQty } from '../utils/format.js';
import { todayKey } from '../utils/date.js';
import { openSheet } from './ui/sheet.js';
import { toastOk, toastError } from './ui/toast.js';
import { field, numberInput, moneyInput, select, textarea, input, readForm, setFieldError } from './ui/form.js';
import { state, refresh } from '../state.js';
import { registerPurchase, updatePurchase } from '../services/purchase-service.js';
import { bestStoreFor, suggestedPrice, productPriceStats } from '../services/price-service.js';
import { openStoreForm } from './store-form.js';
import { openProductForm } from './product-form.js';

const NEW_STORE = '__new__';
const NEW_PRODUCT = '__new__';

export function openPurchaseForm({
  productId = null,
  shoppingItemId = null,
  quantity = 1,
  storeId = null,
  unitPrice = null,
  purchase = null,
  onSaved = null,
} = {}) {
  return new Promise((resolve) => {
    const editing = !!purchase;
    let currentProductId = purchase?.productId || productId;
    let totalTouched = false;
    let priceTouched = false;
    let resolved = false;

    const productSelect = select(
      [{ value: '', label: 'Selecciona un producto' },
        ...[...state.products].sort((a, b) => a.name.localeCompare(b.name, 'es')).map((p) => ({ value: p.id, label: p.name })),
        { value: NEW_PRODUCT, label: '＋ Nuevo producto…' }],
      currentProductId || '',
      { name: 'productId' },
    );

    const storeSelect = select(
      [{ value: '', label: 'Sin comercio' },
        ...[...state.stores].sort((a, b) => a.name.localeCompare(b.name, 'es')).map((s) => ({ value: s.id, label: s.name })),
        { value: NEW_STORE, label: '＋ Nuevo comercio…' }],
      purchase?.storeId || storeId || '',
      { name: 'storeId' },
    );

    const quantityInput = numberInput({ name: 'quantity', value: purchase?.quantity ?? quantity, min: '0.001' });
    const priceWrap = moneyInput(state.settings?.currency?.symbol || '$', {
      name: 'unitPrice',
      value: purchase?.unitPrice ?? (unitPrice ?? ''),
      placeholder: '0.00',
      'data-autofocus': '',
    });
    const priceInput = priceWrap.querySelector('input');
    const totalWrap = moneyInput(state.settings?.currency?.symbol || '$', { name: 'totalPrice', value: purchase?.totalPrice ?? '', placeholder: '0.00' });
    const totalInput = totalWrap.querySelector('input');
    const dateInput = input({ type: 'date', name: 'purchaseDate', value: purchase?.purchaseDate || todayKey(), max: todayKey() });
    const notesInput = textarea({ name: 'notes', value: purchase?.notes || '', rows: 2, placeholder: 'Opcional' });

    const hintRow = h('div.row.row--wrap', { style: { gap: '6px', marginTop: '-6px', marginBottom: '14px' } });

    function applySuggestions() {
      hintRow.replaceChildren();
      if (!currentProductId) return;
      const stats = productPriceStats(currentProductId);
      const best = bestStoreFor(currentProductId);
      const chips = [];
      if (stats.avg != null) chips.push({ label: `Promedio ${money(stats.avg)}`, value: stats.avg });
      if (stats.last != null) chips.push({ label: `Último ${money(stats.last)}`, value: stats.last });
      if (best && best.storeId !== storeSelect.value) {
        chips.push({ label: `Mejor: ${best.storeName} ${money(best.avg)}`, value: best.avg, storeId: best.storeId, best: true });
      }
      chips.forEach((chip) => {
        hintRow.appendChild(h('button', {
          type: 'button',
          class: `chip${chip.best ? '' : ''}`,
          onclick: () => {
            priceInput.value = chip.value;
            priceTouched = true;
            if (chip.storeId) storeSelect.value = chip.storeId;
            recalcTotal();
          },
        }, chip.best ? h('span', { html: icon('star', { size: 14 }) }) : null, chip.label));
      });
      if (!chips.length) {
        hintRow.appendChild(h('span.muted.small', 'Primera compra registrada de este producto.'));
      }
    }

    function recalcTotal() {
      const q = toNumber(quantityInput.value, 0);
      const p = toNumber(priceInput.value, 0);
      if (!totalTouched) totalInput.value = q > 0 && p > 0 ? round(q * p, 2) : '';
    }

    function recalcUnitFromTotal() {
      const q = toNumber(quantityInput.value, 0);
      const t = toNumber(totalInput.value, 0);
      if (q > 0 && t > 0) priceInput.value = round(t / q, 4);
    }

    function fillSuggestedPrice() {
      if (priceTouched || editing || !currentProductId) return;
      const suggestion = suggestedPrice(currentProductId, storeSelect.value || null);
      if (suggestion != null) {
        priceInput.value = suggestion;
        recalcTotal();
      }
    }

    quantityInput.addEventListener('input', () => { totalTouched = false; recalcTotal(); });
    priceInput.addEventListener('input', () => { priceTouched = true; totalTouched = false; recalcTotal(); });
    totalInput.addEventListener('input', () => { totalTouched = true; recalcUnitFromTotal(); });

    storeSelect.addEventListener('change', async () => {
      if (storeSelect.value === NEW_STORE) {
        storeSelect.value = '';
        const created = await openStoreForm();
        if (created) {
          storeSelect.insertBefore(h('option', { value: created.id }, created.name), storeSelect.options[storeSelect.options.length - 1]);
          storeSelect.value = created.id;
        }
      }
      fillSuggestedPrice();
      applySuggestions();
    });

    productSelect.addEventListener('change', async () => {
      if (productSelect.value === NEW_PRODUCT) {
        productSelect.value = currentProductId || '';
        const created = await openProductForm(null, { defaults: { currentQuantity: 0 } });
        if (created) {
          productSelect.insertBefore(h('option', { value: created.id }, created.name), productSelect.options[productSelect.options.length - 1]);
          productSelect.value = created.id;
        }
      }
      currentProductId = productSelect.value || null;
      priceTouched = false;
      fillSuggestedPrice();
      applySuggestions();
    });

    const product = currentProductId ? state.productsById.get(currentProductId) : null;
    const header = product ? h('div.tile', { style: { marginBottom: '14px' } },
      h('div.thumb.thumb--ok', { html: icon('jar', { size: 20 }) }),
      h('div.tile__body',
        h('div.tile__title', product.name),
        h('div.tile__meta', product.unit, ' · ', `Tienes ${fmtQty(product.currentQuantity)}`),
      ),
    ) : null;

    const form = h('form', { onsubmit: (e) => e.preventDefault() },
      header,
      product ? null : field('Producto', productSelect, { required: true }),
      h('div.form-row',
        field('Cantidad', quantityInput, { required: true }),
        field('Comercio', storeSelect),
      ),
      field('Precio unitario', priceWrap, { required: true }),
      hintRow,
      field('Precio total', totalWrap, { hint: 'Se calcula solo; puedes escribirlo si el ticket difiere.' }),
      field('Fecha', dateInput),
      field('Notas', notesInput),
    );

    applySuggestions();
    if (!editing && unitPrice == null) fillSuggestedPrice();
    else recalcTotal();

    openSheet({
      title: editing ? 'Editar compra' : 'Registrar compra',
      subtitle: editing ? '' : 'Se actualizará tu inventario y los precios promedio',
      content: form,
      onClose: () => { if (!resolved) resolve(null); },
      actions: [
        { label: 'Cancelar', variant: 'btn-soft', onClick: () => { resolved = true; resolve(null); } },
        {
          label: editing ? 'Guardar cambios' : 'Guardar compra',
          variant: 'btn-primary',
          keepOpen: true,
          onClick: async (api) => {
            const values = readForm(form);
            const targetProduct = product?.id || values.productId;
            if (!targetProduct || targetProduct === NEW_PRODUCT) {
              setFieldError(productSelect, 'Elige un producto.');
              return false;
            }
            if (toNumber(values.quantity, 0) <= 0) {
              setFieldError(quantityInput, 'La cantidad debe ser mayor que cero.');
              return false;
            }
            if (toNumber(values.unitPrice, -1) < 0) {
              setFieldError(priceInput, 'Escribe un precio válido.');
              return false;
            }
            api.setBusy(true);
            try {
              const payload = {
                productId: targetProduct,
                quantity: toNumber(values.quantity, 1),
                unitPrice: toNumber(values.unitPrice, 0),
                totalPrice: values.totalPrice === '' ? null : toNumber(values.totalPrice, 0),
                storeId: values.storeId === NEW_STORE ? null : (values.storeId || null),
                purchaseDate: values.purchaseDate || todayKey(),
                notes: values.notes || '',
              };
              const saved = editing
                ? await updatePurchase(purchase.id, payload)
                : await registerPurchase({ ...payload, shoppingItemId });
              await refresh(['products', 'purchases', 'shoppingList']);
              toastOk(editing ? 'Compra actualizada' : 'Compra registrada correctamente');
              resolved = true;
              onSaved?.(saved);
              resolve(saved);
              api.close();
            } catch (error) {
              toastError(error, 'No se pudo registrar la compra.');
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
