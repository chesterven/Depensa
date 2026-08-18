/**
 * Registro de compras: crea el historial, actualiza el inventario,
 * recalcula precios y limpia la lista de compras.
 */
import * as purchasesDb from '../database/purchases.js';
import * as productsDb from '../database/products.js';
import * as listDb from '../database/shopping-list.js';
import { state, refresh } from '../state.js';
import { recalcProductStats, syncShoppingForProduct } from './inventory-service.js';
import { round, toNumber, normalize } from '../utils/format.js';
import { nowIso } from '../utils/id.js';
import { todayKey, parseDate } from '../utils/date.js';

/**
 * Registra una compra.
 * @param {object} input
 * @param {boolean} [input.updateInventory=true] suma la cantidad comprada al inventario
 * @param {string}  [input.shoppingItemId] elemento de la lista que se marca como comprado
 */
export async function registerPurchase(input) {
  const productId = input.productId;
  const product = productId ? await productsDb.getProduct(productId) : null;
  const store = input.storeId ? state.storesById.get(input.storeId) : null;
  const quantity = round(toNumber(input.quantity, 1), 3);
  const unitPrice = round(toNumber(input.unitPrice, 0), 4);
  const totalPrice = input.totalPrice === '' || input.totalPrice == null
    ? round(quantity * unitPrice, 2)
    : round(toNumber(input.totalPrice, 0), 2);

  const purchase = await purchasesDb.savePurchase({
    productId,
    productName: product?.name || input.productName || '',
    categoryId: product?.categoryId || input.categoryId || null,
    storeId: input.storeId || null,
    storeName: store?.name || input.storeName || '',
    quantity,
    unitPrice,
    totalPrice,
    purchaseDate: input.purchaseDate || todayKey(),
    notes: input.notes || '',
  });

  if (product && input.updateInventory !== false) {
    await productsDb.putProduct({
      ...product,
      currentQuantity: round((Number(product.currentQuantity) || 0) + quantity, 3),
      updatedAt: nowIso(),
    });
  }

  if (productId) await recalcProductStats(productId);

  // Retira el producto de la lista de compras
  const items = await listDb.listShoppingItems();
  const target = input.shoppingItemId
    ? items.find((item) => item.id === input.shoppingItemId)
    : items.find((item) => item.productId === productId && item.status === 'pending');
  if (target) await listDb.deleteShoppingItem(target.id);

  await refresh(['products', 'purchases', 'shoppingList'], { silent: true });
  if (productId) await syncShoppingForProduct(productId);
  await refresh(['products', 'purchases', 'shoppingList']);
  return purchase;
}

/** Edita una compra existente. No modifica la cantidad del inventario. */
export async function updatePurchase(id, data) {
  const existing = await purchasesDb.getPurchase(id);
  if (!existing) throw new Error('La compra ya no existe.');
  const quantity = round(toNumber(data.quantity, existing.quantity), 3);
  const unitPrice = round(toNumber(data.unitPrice, existing.unitPrice), 4);
  const totalPrice = data.totalPrice === '' || data.totalPrice == null
    ? round(quantity * unitPrice, 2)
    : round(toNumber(data.totalPrice, 0), 2);
  const store = data.storeId ? state.storesById.get(data.storeId) : null;
  const record = await purchasesDb.savePurchase({
    ...existing,
    ...data,
    quantity,
    unitPrice,
    totalPrice,
    storeName: store?.name || existing.storeName || '',
  });
  if (record.productId) await recalcProductStats(record.productId);
  await refresh(['products', 'purchases']);
  return record;
}

/** Elimina una compra del historial (no descuenta el inventario). */
export async function deletePurchase(id) {
  const existing = await purchasesDb.getPurchase(id);
  if (!existing) return false;
  await purchasesDb.deletePurchase(id);
  if (existing.productId) await recalcProductStats(existing.productId);
  await refresh(['products', 'purchases']);
  return true;
}

/** Filtros del historial. */
export function filterPurchases(purchases, filters = {}) {
  const { query = '', productId = '', categoryId = '', storeId = '', from = '', to = '' } = filters;
  const q = normalize(query);
  return purchases.filter((purchase) => {
    if (q) {
      const haystack = `${purchase.productName} ${purchase.storeName} ${purchase.notes}`;
      if (!normalize(haystack).includes(q)) return false;
    }
    if (productId && purchase.productId !== productId) return false;
    if (storeId && purchase.storeId !== storeId) return false;
    if (categoryId) {
      const product = state.productsById.get(purchase.productId);
      const cat = product?.categoryId || purchase.categoryId;
      if (cat !== categoryId) return false;
    }
    if (from && String(purchase.purchaseDate) < from) return false;
    if (to && String(purchase.purchaseDate) > to) return false;
    return true;
  });
}

export function sortPurchases(purchases, sort = 'date-desc') {
  const collator = new Intl.Collator('es', { sensitivity: 'base' });
  const list = [...purchases];
  switch (sort) {
    case 'date-asc': return list.sort((a, b) => String(a.purchaseDate).localeCompare(String(b.purchaseDate)));
    case 'product': return list.sort((a, b) => collator.compare(a.productName || '', b.productName || ''));
    case 'store': return list.sort((a, b) => collator.compare(a.storeName || '', b.storeName || ''));
    case 'price-desc': return list.sort((a, b) => (b.totalPrice || 0) - (a.totalPrice || 0));
    case 'price-asc': return list.sort((a, b) => (a.totalPrice || 0) - (b.totalPrice || 0));
    default: return list.sort((a, b) => {
      const diff = String(b.purchaseDate).localeCompare(String(a.purchaseDate));
      return diff !== 0 ? diff : String(b.createdAt).localeCompare(String(a.createdAt));
    });
  }
}

/** Últimas compras registradas. */
export function recentPurchases(limit = 5, purchases = state.purchases) {
  return sortPurchases(purchases, 'date-desc').slice(0, limit);
}

/** Agrupa compras por día (para el historial). */
export function groupByDate(purchases) {
  const groups = new Map();
  for (const purchase of purchases) {
    const key = purchase.purchaseDate || 'sin-fecha';
    if (!groups.has(key)) groups.set(key, { date: key, items: [], total: 0 });
    const group = groups.get(key);
    group.items.push(purchase);
    group.total = round(group.total + (Number(purchase.totalPrice) || 0), 2);
  }
  return [...groups.values()].sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export { parseDate };
