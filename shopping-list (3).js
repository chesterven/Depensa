/** Acceso a datos de la lista de compras. */
import { STORE, getAll, get, put, remove, bulkPut, removeMany } from './database.js';
import { uuid, nowIso } from '../utils/id.js';

export const ITEM_STATUS = { PENDING: 'pending', PURCHASED: 'purchased' };

export function createShoppingItem(data = {}) {
  const ts = nowIso();
  const price = data.estimatedPrice;
  return {
    id: data.id || uuid(),
    productId: data.productId || null,
    name: (data.name || '').trim(),
    quantity: Math.max(1, Math.round(Number(data.quantity) || 1)),
    estimatedPrice: price === '' || price == null || !isFinite(Number(price)) ? null : Number(price),
    storeId: data.storeId || null,
    status: data.status || ITEM_STATUS.PENDING,
    auto: !!data.auto, // agregado automáticamente al marcar el producto como agotado
    notes: data.notes || '',
    createdAt: data.createdAt || ts,
    updatedAt: data.updatedAt || ts,
  };
}

export const listShoppingItems = () => getAll(STORE.SHOPPING_LIST);
export const getShoppingItem = (id) => get(STORE.SHOPPING_LIST, id);

export async function saveShoppingItem(data) {
  const record = createShoppingItem({ ...data, updatedAt: nowIso() });
  await put(STORE.SHOPPING_LIST, record);
  return record;
}

export const deleteShoppingItem = (id) => remove(STORE.SHOPPING_LIST, id);
export const deleteShoppingItems = (ids) => removeMany(STORE.SHOPPING_LIST, ids);
export const bulkPutShoppingItems = (list) => bulkPut(STORE.SHOPPING_LIST, list);
