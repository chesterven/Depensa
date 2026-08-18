/**
 * Exportación e importación de toda la información.
 * El archivo JSON es el mecanismo para compartir los datos entre los miembros del hogar.
 * Nada se envía a ningún servidor: el usuario controla el archivo en todo momento.
 */
import { STORE, clearAll } from '../database/database.js';
import * as productsDb from '../database/products.js';
import * as storesDb from '../database/stores.js';
import * as categoriesDb from '../database/categories.js';
import * as listDb from '../database/shopping-list.js';
import { getAppSettings, saveAppSettings } from '../database/settings.js';
import { listPhotos, bulkPutPhotos } from '../database/photos.js';
import { refresh } from '../state.js';
import { normalize } from '../utils/format.js';
import { todayKey } from '../utils/date.js';
import { uuid, nowIso } from '../utils/id.js';

export const FORMAT_VERSION = 2;
export const APP_ID = 'despensa-hogar';

/** Nombre sugerido del archivo: inventario-hogar-2026-08-17.json */
export function backupFilename(date = new Date()) {
  return `inventario-hogar-${todayKey(date)}.json`;
}

/** Construye el objeto completo de respaldo. */
export async function buildBackup({ includePhotos = true } = {}) {
  const [products, stores, categories, shoppingList, settings, photos] = await Promise.all([
    productsDb.listProducts(),
    storesDb.listStores(),
    categoriesDb.listCategories(),
    listDb.listShoppingItems(),
    getAppSettings(),
    includePhotos ? listPhotos() : Promise.resolve([]),
  ]);
  return {
    app: APP_ID,
    appName: 'Despensa',
    formatVersion: FORMAT_VERSION,
    exportedAt: nowIso(),
    counts: {
      products: products.length,
      stores: stores.length,
      categories: categories.length,
      shoppingList: shoppingList.length,
      photos: photos.length,
    },
    data: { products, stores, categories, shoppingList, settings, photos },
  };
}

export function backupToBlob(payload) {
  return new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
}

/** Descarga el respaldo como archivo. */
export async function downloadBackup(options = {}) {
  const payload = await buildBackup(options);
  const blob = backupToBlob(payload);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = backupFilename();
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  await markBackupDone();
  return { payload, size: blob.size, filename: backupFilename() };
}

/** ¿El dispositivo puede compartir archivos? */
export function canShareFiles() {
  try {
    if (!navigator.canShare || !navigator.share) return false;
    const probe = new File(['{}'], 'test.json', { type: 'application/json' });
    return navigator.canShare({ files: [probe] });
  } catch (_) {
    return false;
  }
}

/** Comparte el archivo con WhatsApp, Telegram, AirDrop, correo, Drive, Archivos, etc. */
export async function shareBackup(options = {}) {
  const payload = await buildBackup(options);
  const blob = backupToBlob(payload);
  const file = new File([blob], backupFilename(), { type: 'application/json' });
  if (canShareFiles()) {
    await navigator.share({
      files: [file],
      title: 'Inventario del hogar',
      text: 'Respaldo de la despensa (ábrelo desde la app con «Importar»).',
    });
    await markBackupDone();
    return { shared: true, size: blob.size };
  }
  const result = await downloadBackup(options);
  return { shared: false, ...result };
}

async function markBackupDone() {
  await saveAppSettings({ lastBackupAt: nowIso() });
  await refresh(['settings'], { silent: true });
}

/** Lee un archivo seleccionado por el usuario. */
export function readBackupFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result)));
      } catch (_) {
        reject(new Error('El archivo no es un JSON válido.'));
      }
    };
    reader.readAsText(file);
  });
}

/**
 * Convierte respaldos de la versión anterior (que incluían historial de compras)
 * al formato actual: estado disponible/agotado, comercio habitual y precio de referencia.
 */
export function normalizePayload(payload) {
  const data = { ...(payload?.data || {}) };
  const legacyPurchases = Array.isArray(data.purchases) ? data.purchases : null;
  const isLegacy = legacyPurchases || (payload?.formatVersion ?? 1) < 2;
  if (!isLegacy) return { payload, converted: false, legacyPurchases: 0 };

  const lastByProduct = new Map();
  for (const purchase of legacyPurchases || []) {
    const current = lastByProduct.get(purchase.productId);
    if (!current || String(purchase.purchaseDate) > String(current.purchaseDate)) {
      lastByProduct.set(purchase.productId, purchase);
    }
  }

  data.products = (data.products || []).map((product) => {
    const last = lastByProduct.get(product.id);
    const quantity = Number(product.currentQuantity);
    return {
      ...product,
      storeId: product.storeId || product.lastStoreId || last?.storeId || null,
      referencePrice: product.referencePrice ?? product.avgPrice ?? product.lastPrice ?? last?.unitPrice ?? null,
      status: product.status || (isFinite(quantity) && quantity > 0 ? 'available' : 'out'),
      lastPurchasedAt: product.lastPurchasedAt || product.lastPurchaseDate || null,
    };
  });
  delete data.purchases;

  return {
    payload: { ...payload, formatVersion: FORMAT_VERSION, data },
    converted: true,
    legacyPurchases: (legacyPurchases || []).length,
  };
}

/** Valida el contenido y devuelve el resumen que se muestra antes de importar. */
export function analyzeBackup(rawPayload) {
  const errors = [];
  const warnings = [];
  if (!rawPayload || typeof rawPayload !== 'object') errors.push('El archivo está vacío o dañado.');

  const { payload, converted, legacyPurchases } = normalizePayload(rawPayload || {});
  const data = payload?.data || {};
  const arrays = ['products', 'stores', 'categories', 'shoppingList'];
  if (!errors.length && !arrays.some((key) => Array.isArray(data[key]))) {
    errors.push('El archivo no contiene datos de la despensa.');
  }
  if (rawPayload?.app && rawPayload.app !== APP_ID) warnings.push('El archivo proviene de otra aplicación.');
  if ((rawPayload?.formatVersion ?? 1) > FORMAT_VERSION) {
    warnings.push('El archivo fue creado con una versión más nueva de la app. Algunos datos podrían ignorarse.');
  }
  if (converted && legacyPurchases) {
    warnings.push(`El archivo incluye ${legacyPurchases} compras de la versión anterior: se conservarán el comercio y el precio de referencia de cada producto, no el historial.`);
  }

  const summary = {
    products: (data.products || []).length,
    stores: (data.stores || []).length,
    categories: (data.categories || []).length,
    shoppingList: (data.shoppingList || []).length,
    photos: (data.photos || []).length,
    exportedAt: payload?.exportedAt || null,
  };
  return { valid: errors.length === 0, errors, warnings, summary, payload };
}

const byName = (list) => new Map(list.map((item) => [normalize(item.name), item]));
const byId = (list) => new Map(list.map((item) => [item.id, item]));
const newer = (a, b) => (String(a?.updatedAt || a?.createdAt || '') >= String(b?.updatedAt || b?.createdAt || '') ? a : b);

/**
 * Importa la información.
 * @param {object} rawPayload contenido del archivo
 * @param {'replace'|'merge'} mode
 */
export async function importBackup(rawPayload, mode = 'merge') {
  const { payload } = normalizePayload(rawPayload);
  const data = payload?.data || {};
  const report = {
    mode,
    products: { added: 0, updated: 0, skipped: 0 },
    stores: { added: 0, skipped: 0 },
    categories: { added: 0, skipped: 0 },
    shoppingList: { added: 0, skipped: 0 },
    photos: { added: 0, skipped: 0 },
  };

  if (mode === 'replace') {
    await clearAll([STORE.PRODUCTS, STORE.STORES, STORE.CATEGORIES, STORE.SHOPPING_LIST, STORE.PHOTOS]);
  }

  /* ---------- Categorías ---------- */
  const existingCategories = await categoriesDb.listCategories();
  const catById = byId(existingCategories);
  const catByName = byName(existingCategories);
  const catMap = new Map();
  const catsToAdd = [];
  for (const incoming of data.categories || []) {
    const record = categoriesDb.createCategory(incoming);
    if (catById.has(record.id)) { catMap.set(incoming.id, record.id); report.categories.skipped += 1; continue; }
    const sameName = catByName.get(normalize(record.name));
    if (sameName) { catMap.set(incoming.id, sameName.id); report.categories.skipped += 1; continue; }
    catMap.set(incoming.id, record.id);
    catsToAdd.push(record);
    catByName.set(normalize(record.name), record);
    report.categories.added += 1;
  }
  if (catsToAdd.length) await categoriesDb.bulkPutCategories(catsToAdd);

  /* ---------- Comercios ---------- */
  const existingStores = await storesDb.listStores();
  const storeById = byId(existingStores);
  const storeByName = byName(existingStores);
  const storeMap = new Map();
  const storesToAdd = [];
  for (const incoming of data.stores || []) {
    const record = storesDb.createStore(incoming);
    if (storeById.has(record.id)) { storeMap.set(incoming.id, record.id); report.stores.skipped += 1; continue; }
    const sameName = storeByName.get(normalize(record.name));
    if (sameName) { storeMap.set(incoming.id, sameName.id); report.stores.skipped += 1; continue; }
    storeMap.set(incoming.id, record.id);
    storesToAdd.push(record);
    storeByName.set(normalize(record.name), record);
    report.stores.added += 1;
  }
  if (storesToAdd.length) await storesDb.bulkPutStores(storesToAdd);

  /* ---------- Productos ---------- */
  const existingProducts = await productsDb.listProducts();
  const prodById = byId(existingProducts);
  const prodByName = byName(existingProducts);
  const productMap = new Map();
  const productsToPut = [];
  for (const incoming of data.products || []) {
    const record = productsDb.createProduct({
      ...incoming,
      categoryId: catMap.get(incoming.categoryId) || incoming.categoryId || null,
      storeId: storeMap.get(incoming.storeId) || incoming.storeId || null,
    });
    const current = prodById.get(record.id) || prodByName.get(normalize(record.name));
    if (current) {
      productMap.set(incoming.id, current.id);
      const winner = newer(record, current);
      if (winner === record) {
        productsToPut.push({ ...current, ...record, id: current.id, createdAt: current.createdAt });
        report.products.updated += 1;
      } else {
        report.products.skipped += 1;
      }
      continue;
    }
    productMap.set(incoming.id, record.id);
    productsToPut.push(record);
    prodByName.set(normalize(record.name), record);
    report.products.added += 1;
  }
  if (productsToPut.length) await productsDb.bulkPutProducts(productsToPut);

  /* ---------- Lista de compras ---------- */
  const existingItems = await listDb.listShoppingItems();
  const itemIds = new Set(existingItems.map((i) => i.id));
  const pendingProducts = new Set(existingItems.filter((i) => i.status === 'pending').map((i) => i.productId));
  const itemsToAdd = [];
  for (const incoming of data.shoppingList || []) {
    const productId = productMap.get(incoming.productId) || incoming.productId || null;
    if (incoming.status === 'pending' && productId && pendingProducts.has(productId)) { report.shoppingList.skipped += 1; continue; }
    const record = listDb.createShoppingItem({
      ...incoming,
      id: itemIds.has(incoming.id) ? uuid() : incoming.id,
      productId,
      storeId: storeMap.get(incoming.storeId) || incoming.storeId || null,
    });
    itemIds.add(record.id);
    if (productId) pendingProducts.add(productId);
    itemsToAdd.push(record);
    report.shoppingList.added += 1;
  }
  if (itemsToAdd.length) await listDb.bulkPutShoppingItems(itemsToAdd);

  /* ---------- Fotografías ---------- */
  const existingPhotos = await listPhotos();
  const photoById = byId(existingPhotos);
  const photosToAdd = [];
  for (const incoming of data.photos || []) {
    const id = productMap.get(incoming.id) || incoming.id;
    const current = photoById.get(id);
    if (current && String(current.updatedAt || '') >= String(incoming.updatedAt || '')) { report.photos.skipped += 1; continue; }
    photosToAdd.push({ id, dataUrl: incoming.dataUrl, updatedAt: incoming.updatedAt || nowIso() });
    report.photos.added += 1;
  }
  if (photosToAdd.length) await bulkPutPhotos(photosToAdd);

  /* ---------- Configuración ---------- */
  if (data.settings) {
    const incoming = { ...data.settings };
    delete incoming.lastBackupAt;
    if (mode === 'replace') await saveAppSettings(incoming);
    else {
      const current = await getAppSettings();
      await saveAppSettings({ ...incoming, ...current, currency: current.currency });
    }
  }

  await refresh();
  return report;
}

/** Elimina toda la información local (acción irreversible). */
export async function wipeAllData() {
  await clearAll([STORE.PRODUCTS, STORE.STORES, STORE.CATEGORIES, STORE.SHOPPING_LIST, STORE.PHOTOS]);
  await saveAppSettings({ demoLoaded: false });
  await categoriesDb.ensureDefaultCategories();
  await refresh();
}
