/** Acceso a datos del historial de compras. */
import { STORE, getAll, get, put, remove, bulkPut, getAllByIndex, removeMany } from './database.js';
import { uuid, nowIso } from '../utils/id.js';
import { todayKey } from '../utils/date.js';
import { round } from '../utils/format.js';

/**
 * Cada compra guarda una copia del nombre del producto y del comercio para que el
 * historial siga siendo legible aunque el producto o el comercio se eliminen.
 */
export function createPurchase(data = {}) {
  const quantity = Number(data.quantity) || 0;
  const unitPrice = Number(data.unitPrice) || 0;
  const totalPrice = data.totalPrice != null && data.totalPrice !== ''
    ? Number(data.totalPrice)
    : round(quantity * unitPrice, 2);
  return {
    id: data.id || uuid(),
    productId: data.productId || null,
    productName: data.productName || '',
    categoryId: data.categoryId || null,
    storeId: data.storeId || null,
    storeName: data.storeName || '',
    quantity,
    unitPrice: round(unitPrice, 4),
    totalPrice: round(totalPrice, 2),
    purchaseDate: data.purchaseDate || todayKey(),
    notes: data.notes || '',
    createdAt: data.createdAt || nowIso(),
    ...(data.demo ? { demo: true } : {}),
  };
}

export const listPurchases = () => getAll(STORE.PURCHASES);
export const getPurchase = (id) => get(STORE.PURCHASES, id);
export const listPurchasesByProduct = (productId) => getAllByIndex(STORE.PURCHASES, 'productId', productId);
export const listPurchasesByStore = (storeId) => getAllByIndex(STORE.PURCHASES, 'storeId', storeId);

export async function savePurchase(data) {
  const record = createPurchase(data);
  await put(STORE.PURCHASES, record);
  return record;
}

export const deletePurchase = (id) => remove(STORE.PURCHASES, id);
export const deletePurchases = (ids) => removeMany(STORE.PURCHASES, ids);
export const bulkPutPurchases = (list) => bulkPut(STORE.PURCHASES, list);
