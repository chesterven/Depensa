/** Operaciones de la lista de compras. */
import * as listDb from '../database/shopping-list.js';
import * as productsDb from '../database/products.js';
import { state, refresh } from '../state.js';
import { findProductByName, markAsPurchased, syncShoppingForProduct, STATUS } from './inventory-service.js';
import { round, toNumber } from '../utils/format.js';
import { nowIso } from '../utils/id.js';

/**
 * Agrega un producto a la lista de compras.
 * Si el nombre no existe en el inventario se crea el producto (como agotado),
 * de modo que la lista y el inventario nunca se desincronizan.
 */
export async function addItem({ productId = null, name = '', quantity = 1, storeId = null, estimatedPrice = null, notes = '', categoryId = null, unit = '' }) {
  let product = productId ? state.productsById.get(productId) : findProductByName(name);
  if (!product && name.trim()) {
    product = await productsDb.saveProduct({
      name: name.trim(),
      categoryId,
      unit,
      storeId,
      referencePrice: estimatedPrice,
      status: STATUS.OUT,
    });
    await refresh(['products'], { silent: true });
  }
  const targetId = product?.id || null;
  const existing = targetId
    ? state.shoppingList.find((item) => item.productId === targetId && item.status === 'pending')
    : null;

  if (existing) {
    await listDb.saveShoppingItem({ ...existing, quantity: (Number(existing.quantity) || 1) + (Number(quantity) || 1) });
  } else {
    await listDb.saveShoppingItem({
      productId: targetId,
      name: product?.name || name.trim(),
      quantity: Math.max(1, toNumber(quantity, 1)),
      estimatedPrice: estimatedPrice ?? product?.referencePrice ?? null,
      storeId: storeId || product?.storeId || null,
      notes,
      auto: false,
      status: 'pending',
    });
  }

  // Si el producto estaba disponible, al ponerlo en la lista se considera agotado
  if (product && product.status !== STATUS.OUT) {
    await productsDb.putProduct({ ...product, status: STATUS.OUT, updatedAt: nowIso() });
  }
  await refresh(['products', 'shoppingList']);
  return true;
}

export async function updateItem(id, patch) {
  const existing = await listDb.getShoppingItem(id);
  if (!existing) return null;
  const record = await listDb.saveShoppingItem({ ...existing, ...patch, auto: patch.auto ?? existing.auto });
  await refresh(['shoppingList']);
  return record;
}

export async function removeItem(id) {
  const item = await listDb.getShoppingItem(id);
  await listDb.deleteShoppingItem(id);
  await refresh(['shoppingList']);
  return item;
}

/**
 * Marca un artículo como comprado: el producto vuelve a estar disponible
 * y el artículo sale de la lista. Devuelve los datos necesarios para deshacer.
 */
export async function markItemPurchased(itemId) {
  const item = await listDb.getShoppingItem(itemId);
  if (!item) return null;
  const product = item.productId ? await productsDb.getProduct(item.productId) : null;
  const snapshot = {
    item,
    product: product ? { id: product.id, status: product.status, lastPurchasedAt: product.lastPurchasedAt, storeId: product.storeId } : null,
  };
  if (product) {
    await markAsPurchased(product.id, { storeId: item.storeId || product.storeId || null });
  } else {
    await listDb.deleteShoppingItem(item.id);
    await refresh(['shoppingList']);
  }
  return snapshot;
}

/** Deshace la acción anterior (el producto vuelve a la lista como agotado). */
export async function undoPurchase(snapshot) {
  if (!snapshot) return false;
  if (snapshot.product) {
    const product = await productsDb.getProduct(snapshot.product.id);
    if (product) {
      await productsDb.putProduct({
        ...product,
        status: snapshot.product.status,
        lastPurchasedAt: snapshot.product.lastPurchasedAt,
        storeId: snapshot.product.storeId,
        updatedAt: nowIso(),
      });
    }
  }
  await listDb.saveShoppingItem(snapshot.item);
  await refresh(['products', 'shoppingList']);
  return true;
}

/** Vacía la lista de compras (los productos siguen marcados como agotados). */
export async function clearPending() {
  const ids = state.shoppingList.filter((item) => item.status === 'pending').map((item) => item.id);
  await listDb.deleteShoppingItems(ids);
  await refresh(['shoppingList']);
  return ids.length;
}

/** Recupera comercio y precio de referencia desde la ficha de cada producto. */
export async function refreshSuggestions() {
  const items = state.shoppingList.filter((item) => item.status === 'pending' && item.productId);
  for (const item of items) {
    const product = state.productsById.get(item.productId);
    if (!product) continue;
    await listDb.saveShoppingItem({
      ...item,
      name: product.name,
      storeId: product.storeId || item.storeId || null,
      estimatedPrice: product.referencePrice ?? item.estimatedPrice,
    });
  }
  await refresh(['shoppingList']);
  return items.length;
}

/** Vuelve a evaluar el inventario y agrega lo que esté agotado. */
export async function rebuildFromInventory() {
  for (const product of state.products) {
    await syncShoppingForProduct(product.id, { force: true });
  }
  await refresh(['shoppingList']);
}

/** Totales estimados de la lista (solo con los precios de referencia disponibles). */
export function listTotals(items = state.shoppingList.filter((i) => i.status === 'pending')) {
  let total = 0;
  let known = 0;
  for (const item of items) {
    const price = Number(item.estimatedPrice);
    if (isFinite(price) && price > 0) {
      total += price * (Number(item.quantity) || 1);
      known += 1;
    }
  }
  return { count: items.length, total: round(total, 2), withPrice: known };
}

/** Artículos agrupados por comercio. */
export function groupByStore(items) {
  const groups = new Map();
  for (const item of items) {
    const key = item.storeId || '__none__';
    if (!groups.has(key)) {
      groups.set(key, {
        storeId: item.storeId || null,
        storeName: state.storesById.get(item.storeId)?.name || 'Sin comercio',
        items: [],
        subtotal: 0,
      });
    }
    const group = groups.get(key);
    group.items.push(item);
    const price = Number(item.estimatedPrice);
    if (isFinite(price) && price > 0) {
      group.subtotal = round(group.subtotal + price * (Number(item.quantity) || 1), 2);
    }
  }
  return [...groups.values()].sort((a, b) => {
    if (!a.storeId) return 1;
    if (!b.storeId) return -1;
    return a.storeName.localeCompare(b.storeName, 'es');
  });
}
