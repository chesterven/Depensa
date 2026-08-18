/** Acceso a datos de productos. Sin lógica de negocio: solo lectura/escritura. */
import { STORE, getAll, get, put, remove, bulkPut, removeMany } from './database.js';
import { uuid, nowIso } from '../utils/id.js';

export const UNITS = [
  'unidad', 'paquete', 'bolsa', 'caja', 'botella', 'lata', 'frasco',
  'libra', 'kilogramo', 'gramo', 'litro', 'mililitro', 'docena', 'rollo', 'par',
];

/** Crea un producto con todos los campos del esquema y sus valores por defecto. */
export function createProduct(data = {}) {
  const ts = nowIso();
  return {
    id: data.id || uuid(),
    name: (data.name || '').trim(),
    categoryId: data.categoryId || null,
    unit: data.unit || 'unidad',
    currentQuantity: Number(data.currentQuantity) || 0,
    minimumQuantity: Number(data.minimumQuantity) || 0,
    notes: data.notes || '',
    hasPhoto: !!data.hasPhoto,
    // Estadísticas denormalizadas (se recalculan desde el historial en cada compra)
    lastPurchaseDate: data.lastPurchaseDate || null,
    lastStoreId: data.lastStoreId || null,
    lastPrice: data.lastPrice ?? null,
    avgPrice: data.avgPrice ?? null,
    minPrice: data.minPrice ?? null,
    maxPrice: data.maxPrice ?? null,
    purchaseCount: Number(data.purchaseCount) || 0,
    createdAt: data.createdAt || ts,
    updatedAt: data.updatedAt || ts,
    // Marca los registros de demostración para poder eliminarlos por separado
    ...(data.demo ? { demo: true } : {}),
  };
}

export const listProducts = () => getAll(STORE.PRODUCTS);
export const getProduct = (id) => get(STORE.PRODUCTS, id);

/** Inserta o actualiza. Devuelve el registro guardado. */
export async function saveProduct(data) {
  const record = createProduct({ ...data, updatedAt: nowIso() });
  await put(STORE.PRODUCTS, record);
  return record;
}

/** Guarda sin normalizar (usado por importación y recálculos internos). */
export async function putProduct(record) {
  await put(STORE.PRODUCTS, record);
  return record;
}

export const deleteProduct = (id) => remove(STORE.PRODUCTS, id);
export const deleteProducts = (ids) => removeMany(STORE.PRODUCTS, ids);
export const bulkPutProducts = (list) => bulkPut(STORE.PRODUCTS, list);
