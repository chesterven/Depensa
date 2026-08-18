/**
 * Lógica de inventario: estados, control de cantidades, alta/baja de productos
 * y sincronización automática con la lista de compras.
 */
import * as productsDb from '../database/products.js';
import * as listDb from '../database/shopping-list.js';
import { listPurchasesByProduct } from '../database/purchases.js';
import { deletePhoto } from '../database/photos.js';
import { state, refresh, purchasesOf } from '../state.js';
import { priceStats, bestStoreFor, suggestedPrice } from './price-service.js';
import { normalize, round, toNumber } from '../utils/format.js';
import { nowIso } from '../utils/id.js';

export const STATUS = { OK: 'ok', LOW: 'low', OUT: 'out' };

export const STATUS_LABEL = {
  [STATUS.OK]: 'Disponible',
  [STATUS.LOW]: 'Por comprar',
  [STATUS.OUT]: 'Agotado',
};

/** Estado calculado a partir de la cantidad actual y la cantidad mínima. */
export function statusOf(product) {
  const current = Number(product?.currentQuantity) || 0;
  const minimum = Number(product?.minimumQuantity) || 0;
  if (current <= 0) return STATUS.OUT;
  if (minimum > 0 && current <= minimum) return STATUS.LOW;
  return STATUS.OK;
}

/** Cantidad sugerida para reponer: llega al doble del mínimo (mínimo 1). */
export function suggestedQuantity(product) {
  const current = Number(product?.currentQuantity) || 0;
  const minimum = Number(product?.minimumQuantity) || 0;
  const target = minimum > 0 ? minimum * 2 : 1;
  const diff = target - current;
  return Math.max(1, Math.ceil(round(diff, 2)));
}

/** Recalcula y persiste las estadísticas denormalizadas del producto. */
export async function recalcProductStats(productId) {
  const product = await productsDb.getProduct(productId);
  if (!product) return null;
  const purchases = await listPurchasesByProduct(productId);
  const ordered = [...purchases].sort((a, b) => String(a.purchaseDate).localeCompare(String(b.purchaseDate)));
  const stats = priceStats(ordered);
  const last = ordered[ordered.length - 1] || null;
  const updated = {
    ...product,
    lastPurchaseDate: last ? last.purchaseDate : null,
    lastStoreId: last ? last.storeId : null,
    lastPrice: stats.last,
    avgPrice: stats.avg,
    minPrice: stats.min,
    maxPrice: stats.max,
    purchaseCount: ordered.length,
    updatedAt: nowIso(),
  };
  await productsDb.putProduct(updated);
  return updated;
}

/**
 * Sincroniza la lista de compras con el estado del producto:
 * agotado o por comprar -> se agrega automáticamente; disponible -> se retira el automático.
 */
export async function syncShoppingForProduct(productId, { force = false } = {}) {
  const product = await productsDb.getProduct(productId);
  if (!product) return;
  const status = statusOf(product);
  const items = await listDb.listShoppingItems();
  const existing = items.find((item) => item.productId === productId && item.status === 'pending');

  if (status === STATUS.OK) {
    if (existing && existing.auto) await listDb.deleteShoppingItem(existing.id);
    return;
  }

  const autoEnabled = state.settings?.autoAddToList !== false;
  if (!autoEnabled && !force) return;

  const best = bestStoreFor(productId);
  const storeId = best?.storeId || product.lastStoreId || null;
  const price = suggestedPrice(productId, storeId);

  if (existing) {
    if (existing.auto) {
      await listDb.saveShoppingItem({
        ...existing,
        name: product.name,
        estimatedPrice: existing.estimatedPrice ?? price,
        storeId: existing.storeId || storeId,
      });
    }
    return;
  }

  await listDb.saveShoppingItem({
    productId,
    name: product.name,
    quantity: suggestedQuantity(product),
    estimatedPrice: price,
    storeId,
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

/** Cambia la cantidad disponible (valor absoluto). */
export async function setQuantity(productId, quantity) {
  const product = await productsDb.getProduct(productId);
  if (!product) return null;
  const value = Math.max(0, round(toNumber(quantity, 0), 3));
  const updated = { ...product, currentQuantity: value, updatedAt: nowIso() };
  await productsDb.putProduct(updated);
  await refresh(['products'], { silent: true });
  await syncShoppingForProduct(productId);
  await refresh(['products', 'shoppingList']);
  return updated;
}

/** Suma o resta a la cantidad disponible. */
export async function adjustQuantity(productId, delta) {
  const product = state.productsById.get(productId) || await productsDb.getProduct(productId);
  if (!product) return null;
  const step = Number(delta) || 0;
  return setQuantity(productId, (Number(product.currentQuantity) || 0) + step);
}

/** Marca el producto como agotado (cantidad 0) y lo envía a la lista de compras. */
export async function markAsOut(productId) {
  const updated = await setQuantity(productId, 0);
  await syncShoppingForProduct(productId, { force: true });
  await refresh(['products', 'shoppingList']);
  return updated;
}

/**
 * Elimina un producto conservando su historial de compras.
 * Las compras guardan el nombre del producto, así que el historial sigue siendo legible.
 */
export async function deleteProduct(productId) {
  const items = await listDb.listShoppingItems();
  const related = items.filter((item) => item.productId === productId).map((item) => item.id);
  if (related.length) await listDb.deleteShoppingItems(related);
  await deletePhoto(productId).catch(() => {});
  await productsDb.deleteProduct(productId);
  await refresh(['products', 'shoppingList']);
  return true;
}

/** Filtro y búsqueda del inventario. */
export function filterProducts(products, { query = '', categoryId = '', status = 'all', sort = 'name' } = {}) {
  const q = normalize(query);
  let result = products.filter((product) => {
    if (q && !normalize(product.name).includes(q) && !normalize(product.notes).includes(q)) return false;
    if (categoryId && product.categoryId !== categoryId) return false;
    const productStatus = statusOf(product);
    switch (status) {
      case 'available': return productStatus === STATUS.OK;
      case 'low': return productStatus === STATUS.LOW;
      case 'out': return productStatus === STATUS.OUT;
      case 'toBuy': return productStatus !== STATUS.OK;
      case 'never': return !product.purchaseCount;
      default: return true;
    }
  });
  const collator = new Intl.Collator('es', { sensitivity: 'base' });
  result = result.sort((a, b) => {
    switch (sort) {
      case 'recent': return String(b.updatedAt).localeCompare(String(a.updatedAt));
      case 'status': {
        const order = { [STATUS.OUT]: 0, [STATUS.LOW]: 1, [STATUS.OK]: 2 };
        const diff = order[statusOf(a)] - order[statusOf(b)];
        return diff !== 0 ? diff : collator.compare(a.name, b.name);
      }
      case 'price': return (b.avgPrice ?? -1) - (a.avgPrice ?? -1);
      default: return collator.compare(a.name, b.name);
    }
  });
  return result;
}

/** Resumen del inventario para el panel de inicio. */
export function inventorySummary(products = state.products) {
  let available = 0; let low = 0; let out = 0;
  for (const product of products) {
    const status = statusOf(product);
    if (status === STATUS.OK) available += 1;
    else if (status === STATUS.LOW) low += 1;
    else out += 1;
  }
  return { total: products.length, available, low, out };
}

/** Busca un producto por nombre normalizado (para evitar duplicados). */
export function findProductByName(name, products = state.products) {
  const key = normalize(name);
  return products.find((product) => normalize(product.name) === key) || null;
}

/** Productos agregados recientemente. */
export function recentProducts(limit = 5, products = state.products) {
  return [...products]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit);
}

export { purchasesOf };
