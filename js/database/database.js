/**
 * Capa base de IndexedDB.
 * - Abre y versiona la base de datos.
 * - Aplica migraciones incrementales (nunca borra datos del usuario).
 * - Expone helpers genéricos para que el resto de la app no toque IndexedDB directamente.
 */

export const DB_NAME = 'despensa-hogar';
export const DB_VERSION = 1;

export const STORE = {
  PRODUCTS: 'products',
  PURCHASES: 'purchases',
  STORES: 'stores',
  CATEGORIES: 'categories',
  SHOPPING_LIST: 'shoppingList',
  SETTINGS: 'settings',
  PHOTOS: 'photos',
};

let dbPromise = null;

/**
 * Migraciones incrementales. Cada bloque se ejecuta solo si la base venía de una versión anterior.
 * Para la versión 2 en adelante basta con añadir `if (oldVersion < 2) { ... }`.
 */
function migrate(db, oldVersion, transaction) {
  if (oldVersion < 1) {
    const products = db.createObjectStore(STORE.PRODUCTS, { keyPath: 'id' });
    products.createIndex('name', 'name', { unique: false });
    products.createIndex('categoryId', 'categoryId', { unique: false });
    products.createIndex('updatedAt', 'updatedAt', { unique: false });

    const purchases = db.createObjectStore(STORE.PURCHASES, { keyPath: 'id' });
    purchases.createIndex('productId', 'productId', { unique: false });
    purchases.createIndex('storeId', 'storeId', { unique: false });
    purchases.createIndex('purchaseDate', 'purchaseDate', { unique: false });

    const stores = db.createObjectStore(STORE.STORES, { keyPath: 'id' });
    stores.createIndex('name', 'name', { unique: false });

    const categories = db.createObjectStore(STORE.CATEGORIES, { keyPath: 'id' });
    categories.createIndex('name', 'name', { unique: false });

    const shopping = db.createObjectStore(STORE.SHOPPING_LIST, { keyPath: 'id' });
    shopping.createIndex('productId', 'productId', { unique: false });
    shopping.createIndex('status', 'status', { unique: false });

    db.createObjectStore(STORE.SETTINGS, { keyPath: 'key' });
    db.createObjectStore(STORE.PHOTOS, { keyPath: 'id' });
  }
  // if (oldVersion < 2) { ...futuras migraciones, usando `transaction` para leer/escribir... }
  void transaction;
}

/** Abre (una sola vez) la base de datos. */
export function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('Este navegador no admite IndexedDB.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      try {
        migrate(request.result, event.oldVersion, request.transaction);
      } catch (error) {
        console.error('[db] error en la migración', error);
        throw error;
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
        window.dispatchEvent(new CustomEvent('db:versionchange'));
      };
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error('No se pudo abrir la base de datos.'));
    request.onblocked = () => {
      window.dispatchEvent(new CustomEvent('db:blocked'));
    };
  });
  return dbPromise;
}

/** Ejecuta una operación dentro de una transacción y devuelve una promesa. */
export async function withStore(storeNames, mode, handler) {
  const db = await openDatabase();
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(names, mode);
    let result;
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('Transacción cancelada'));
    try {
      const stores = names.map((name) => transaction.objectStore(name));
      // El handler debe ser síncrono: IndexedDB cierra la transacción al ceder el hilo.
      result = handler(names.length === 1 ? stores[0] : stores, transaction);
    } catch (error) {
      try { transaction.abort(); } catch (_) { /* ya cancelada */ }
      reject(error);
    }
  });
}

/** Convierte una IDBRequest en promesa. */
export function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getAll(storeName) {
  const db = await openDatabase();
  return req(db.transaction(storeName, 'readonly').objectStore(storeName).getAll());
}

export async function getAllByIndex(storeName, indexName, value) {
  const db = await openDatabase();
  const index = db.transaction(storeName, 'readonly').objectStore(storeName).index(indexName);
  return req(index.getAll(value));
}

export async function get(storeName, key) {
  const db = await openDatabase();
  return req(db.transaction(storeName, 'readonly').objectStore(storeName).get(key));
}

export async function put(storeName, value) {
  await withStore(storeName, 'readwrite', (store) => store.put(value));
  return value;
}

export async function bulkPut(storeName, values) {
  if (!values || !values.length) return 0;
  await withStore(storeName, 'readwrite', (store) => {
    values.forEach((value) => store.put(value));
  });
  return values.length;
}

export async function remove(storeName, key) {
  await withStore(storeName, 'readwrite', (store) => store.delete(key));
  return key;
}

export async function removeMany(storeName, keys) {
  if (!keys || !keys.length) return 0;
  await withStore(storeName, 'readwrite', (store) => {
    keys.forEach((key) => store.delete(key));
  });
  return keys.length;
}

export async function clearStore(storeName) {
  await withStore(storeName, 'readwrite', (store) => store.clear());
}

/** Borra todas las tablas de datos (usado por «Borrar todo» y por la importación en modo reemplazar). */
export async function clearAll(storeNames = Object.values(STORE)) {
  await withStore(storeNames, 'readwrite', (stores) => {
    (Array.isArray(stores) ? stores : [stores]).forEach((store) => store.clear());
  });
}

export async function count(storeName) {
  const db = await openDatabase();
  return req(db.transaction(storeName, 'readonly').objectStore(storeName).count());
}

/** Espacio aproximado usado por la app en el dispositivo. */
export async function estimateStorage() {
  try {
    if (navigator.storage?.estimate) {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      return { usage, quota };
    }
  } catch (_) { /* sin soporte */ }
  return { usage: 0, quota: 0 };
}

/** Solicita almacenamiento persistente para que el navegador no borre los datos. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch (_) { /* sin soporte */ }
  return false;
}
