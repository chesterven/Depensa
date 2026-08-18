/** Operaciones de la lista de compras (manuales y automáticas). */
import * as listDb from '../database/shopping-list.js';
import * as productsDb from '../database/products.js';
import { state, refresh } from '../state.js';
import { bestStoreFor, suggestedPrice } from './price-service.js';
import { findProductByName, syncShoppingForProduct } from './inventory-service.js';
import { round, toNumber } from '../utils/format.js';

/**
 * Agrega un producto a la lista de compras.
 * Si el nombre no existe en el inventario se crea el producto (cantidad 0)
 * para que el historial de precios quede asociado desde la primera compra.
 */
export async function addItem({ productId = null, name = '', quantity = 1, storeId = null, estimatedPrice = null, notes = '', categoryId = null, unit = 'unidad' }) {
  let product = productId ? state.productsById.get(productId) : findProductByName(name);
  if (!product && name.trim()) {
    product = await productsDb.saveProduct({
      name: name.trim(), categoryId, unit, currentQuantity: 0, minimumQuantity: 1,
    });
    await refresh(['products'], { silent: true });
  }
  const targetId = product?.id || null;
  const existing = state.shoppingList.find((item) => item.productId === targetId && item.status === 'pending' && targetId);
  if (existing) {
    await listDb.saveShoppingItem({ ...existing, quantity: round((Number(existing.quantity) || 0) + (Number(quantity) || 1), 3) });
  } else {
    const best = targetId ? bestStoreFor(targetId) : null;
    await listDb.saveShoppingItem({
      productId: targetId,
      name: product?.name || name.trim(),
      quantity: Math.max(0.001, toNumber(quantity, 1)),
      estimatedPrice: estimatedPrice ?? (targetId ? suggestedPrice(targetId, storeId || best?.storeId || null) : null),
      storeId: storeId || best?.storeId || null,
      notes,
      auto: false,
      status: 'pending',
    });
  }
  await refresh(['products', 'shoppingList']);
  return true;
}

export async function updateItem(id, patch) {
  const existing = await listDb.getShoppingItem(id);
  if (!existing) return null;
  const record = await listDb.saveShoppingItem({ ...existing, ...patch, auto: patch.auto ?? false });
  await refresh(['shoppingList']);
  return record;
}

export async function removeItem(id) {
  await listDb.deleteShoppingItem(id);
  await refresh(['shoppingList']);
  return true;
}

/** Vacía la lista de compras (solo los pendientes). */
export async function clearPending() {
  const ids = state.shoppingList.filter((item) => item.status === 'pending').map((item) => item.id);
  await listDb.deleteShoppingItems(ids);
  await refresh(['shoppingList']);
  return ids.length;
}

/** Recalcula precios estimados y comercios sugeridos de toda la lista. */
export async function refreshSuggestions() {
  const items = state.shoppingList.filter((item) => item.status === 'pending' && item.productId);
  for (const item of items) {
    const best = bestStoreFor(item.productId);
    const storeId = item.storeId || best?.storeId || null;
    await listDb.saveShoppingItem({
      ...item,
      storeId,
      estimatedPrice: suggestedPrice(item.productId, storeId) ?? item.estimatedPrice,
    });
  }
  await refresh(['shoppingList']);
  return items.length;
}

/** Vuelve a evaluar todo el inventario y completa la lista con lo que falta. */
export async function rebuildFromInventory() {
  for (const product of state.products) {
    await syncShoppingForProduct(product.id);
  }
  await refresh(['shoppingList']);
}

/** Totales estimados de la lista. */
export function listTotals(items = state.shoppingList.filter((i) => i.status === 'pending')) {
  let total = 0;
  let known = 0;
  for (const item of items) {
    const price = Number(item.estimatedPrice);
    if (isFinite(price) && price > 0) {
      total += price * (Number(item.quantity) || 0);
      known += 1;
    }
  }
  return { count: items.length, total: round(total, 2), withPrice: known };
}

/** Elementos de la lista agrupados por comercio sugerido. */
export function groupByStore(items) {
  const groups = new Map();
  for (const item of items) {
    const key = item.storeId || '__none__';
    if (!groups.has(key)) {
      groups.set(key, {
        storeId: item.storeId || null,
        storeName: state.storesById.get(item.storeId)?.name || 'Sin asignar',
        items: [],
        subtotal: 0,
      });
    }
    const group = groups.get(key);
    group.items.push(item);
    group.subtotal = round(group.subtotal + (Number(item.estimatedPrice) || 0) * (Number(item.quantity) || 0), 2);
  }
  return [...groups.values()].sort((a, b) => {
    if (!a.storeId) return 1;
    if (!b.storeId) return -1;
    return b.subtotal - a.subtotal;
  });
}
