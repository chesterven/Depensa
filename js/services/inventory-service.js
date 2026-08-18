/**
 * Lógica del inventario del hogar.
 * Cada producto está «disponible» o «agotado»; al agotarse pasa automáticamente
 * a la lista de compras y al marcarlo como comprado vuelve a estar disponible.
 */
import * as productsDb from '../database/products.js';
import * as listDb from '../database/shopping-list.js';
import { deletePhoto } from '../database/photos.js';
import { state, refresh } from '../state.js';
import { normalize } from '../utils/format.js';
import { nowIso } from '../utils/id.js';

export const STATUS = productsDb.STATUS;

export const STATUS_LABEL = {
  [STATUS.AVAILABLE]: 'Disponible',
  [STATUS.OUT]: 'Agotado',
};

export const statusOf = (product) => (product?.status === STATUS.OUT ? STATUS.OUT : STATUS.AVAILABLE);
export const isOut = (product) => statusOf(product) === STATUS.OUT;

/**
 * Sincroniza la lista de compras con el estado del producto:
 * agotado -> se agrega automáticamente; disponible -> se retira el que se agregó solo.
 */
export async function syncShoppingForProduct(productId, { force = false } = {}) {
  const product = await productsDb.getProduct(productId);
  if (!product) return;
  const items = await listDb.listShoppingItems();
  const existing = items.find((item) => item.productId === productId && item.status === 'pending');

  if (statusOf(product) === STATUS.AVAILABLE) {
    if (existing && existing.auto) await listDb.deleteShoppingItem(existing.id);
    return;
  }

  const autoEnabled = state.settings?.autoAddToList !== false;
  if (!autoEnabled && !force) return;

  if (existing) {
    if (existing.auto) {
      await listDb.saveShoppingItem({
        ...existing,
        name: product.name,
        storeId: existing.storeId || product.storeId || null,
        estimatedPrice: existing.estimatedPrice ?? product.referencePrice,
      });
    }
    return;
  }

  await listDb.saveShoppingItem({
    productId,
    name: product.name,
    quantity: 1,
    estimatedPrice: product.referencePrice,
    storeId: product.storeId || null,
    auto: true,
    status: 'pending',
  });
}

/** Crea o actualiza un producto y sincroniza la lista de compras. */
export async function saveProduct(data) {
  const record = await productsDb.saveProduct(data);
  await refresh(['products'], { silent: true });
  await syncShoppingForProduct(record.id);
  await refresh(['products', 'shoppingList']);
  return record;
}

/** Marca el producto como agotado y lo envía a la lista de compras. */
export async function markAsOut(productId) {
  const product = await productsDb.getProduct(productId);
  if (!product) return null;
  const updated = await productsDb.putProduct({ ...product, status: STATUS.OUT, updatedAt: nowIso() });
  await refresh(['products'], { silent: true });
  await syncShoppingForProduct(productId, { force: true });
  await refresh(['products', 'shoppingList']);
  return updated;
}

/**
 * Marca el producto como comprado: vuelve a estar disponible, guarda la fecha
 * y sale de la lista de compras. Si se indica un comercio, queda como el habitual.
 */
export async function markAsPurchased(productId, { storeId = undefined } = {}) {
  const product = await productsDb.getProduct(productId);
  if (!product) return null;
  const updated = await productsDb.putProduct({
    ...product,
    status: STATUS.AVAILABLE,
    storeId: storeId === undefined ? product.storeId : (storeId || null),
    lastPurchasedAt: nowIso(),
    updatedAt: nowIso(),
  });
  const items = await listDb.listShoppingItems();
  const pending = items.filter((item) => item.productId === productId && item.status === 'pending');
  if (pending.length) await listDb.deleteShoppingItems(pending.map((item) => item.id));
  await refresh(['products', 'shoppingList']);
  return updated;
}

/** Copia del estado de un producto, para poder deshacer una acción. */
export function snapshotProduct(product) {
  return product
    ? { id: product.id, status: product.status, lastPurchasedAt: product.lastPurchasedAt, storeId: product.storeId }
    : null;
}

/** Restaura el estado guardado por snapshotProduct (usado por «Deshacer»). */
export async function restoreProductState(snapshot) {
  if (!snapshot) return null;
  const product = await productsDb.getProduct(snapshot.id);
  if (!product) return null;
  const updated = await productsDb.putProduct({
    ...product,
    status: snapshot.status,
    lastPurchasedAt: snapshot.lastPurchasedAt,
    storeId: snapshot.storeId,
    updatedAt: nowIso(),
  });
  await refresh(['products'], { silent: true });
  await syncShoppingForProduct(snapshot.id, { force: snapshot.status === STATUS.OUT });
  await refresh(['products', 'shoppingList']);
  return updated;
}

/** Alterna entre disponible y agotado. */
export async function toggleStatus(productId) {
  const product = state.productsById.get(productId) || await productsDb.getProduct(productId);
  if (!product) return null;
  return isOut(product) ? markAsPurchased(productId) : markAsOut(productId);
}

/** Cambia el comercio habitual del producto. */
export async function setStore(productId, storeId) {
  const product = await productsDb.getProduct(productId);
  if (!product) return null;
  const updated = await productsDb.putProduct({ ...product, storeId: storeId || null, updatedAt: nowIso() });
  await refresh(['products']);
  return updated;
}

/** Elimina un producto y todo lo que dependa de él. */
export async function deleteProduct(productId) {
  const items = await listDb.listShoppingItems();
  const related = items.filter((item) => item.productId === productId).map((item) => item.id);
  if (related.length) await listDb.deleteShoppingItems(related);
  await deletePhoto(productId).catch(() => {});
  await productsDb.deleteProduct(productId);
  await refresh(['products', 'shoppingList']);
  return true;
}

/** Filtro, búsqueda y orden del inventario. */
export function filterProducts(products, { query = '', categoryId = '', storeId = '', status = 'all', sort = 'name' } = {}) {
  const q = normalize(query);
  const collator = new Intl.Collator('es', { sensitivity: 'base' });
  const result = products.filter((product) => {
    if (q && !normalize(product.name).includes(q) && !normalize(product.notes).includes(q)) return false;
    if (categoryId && product.categoryId !== categoryId) return false;
    if (storeId && product.storeId !== storeId) return false;
    if (status === 'available') return statusOf(product) === STATUS.AVAILABLE;
    if (status === 'out') return statusOf(product) === STATUS.OUT;
    return true;
  });
  return result.sort((a, b) => {
    switch (sort) {
      case 'recent': return String(b.updatedAt).localeCompare(String(a.updatedAt));
      case 'status': {
        const diff = (isOut(a) ? 0 : 1) - (isOut(b) ? 0 : 1);
        return diff !== 0 ? diff : collator.compare(a.name, b.name);
      }
      case 'store': {
        const sa = state.storesById.get(a.storeId)?.name || 'zzz';
        const sb = state.storesById.get(b.storeId)?.name || 'zzz';
        const diff = collator.compare(sa, sb);
        return diff !== 0 ? diff : collator.compare(a.name, b.name);
      }
      default: return collator.compare(a.name, b.name);
    }
  });
}

/** Resumen del inventario para el panel de inicio. */
export function inventorySummary(products = state.products) {
  let available = 0;
  let out = 0;
  for (const product of products) {
    if (isOut(product)) out += 1;
    else available += 1;
  }
  return { total: products.length, available, out };
}

/** Busca un producto por nombre normalizado (para evitar duplicados). */
export function findProductByName(name, products = state.products) {
  const key = normalize(name);
  return products.find((product) => normalize(product.name) === key) || null;
}

/** Productos agregados recientemente. */
export function recentProducts(limit = 6, products = state.products) {
  return [...products]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit);
}

/** Productos marcados como comprados recientemente. */
export function recentlyPurchased(limit = 5, products = state.products) {
  return products
    .filter((product) => product.lastPurchasedAt)
    .sort((a, b) => String(b.lastPurchasedAt).localeCompare(String(a.lastPurchasedAt)))
    .slice(0, limit);
}

/** Agrupa productos por comercio habitual. */
export function groupByStore(products) {
  const groups = new Map();
  for (const product of products) {
    const key = product.storeId || '__none__';
    if (!groups.has(key)) {
      groups.set(key, {
        storeId: product.storeId || null,
        storeName: state.storesById.get(product.storeId)?.name || 'Sin comercio',
        products: [],
      });
    }
    groups.get(key).products.push(product);
  }
  return [...groups.values()].sort((a, b) => {
    if (!a.storeId) return 1;
    if (!b.storeId) return -1;
    return a.storeName.localeCompare(b.storeName, 'es');
  });
}
