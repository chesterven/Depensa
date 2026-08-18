/** Acceso a datos de productos. Sin lógica de negocio: solo lectura/escritura. */
import { STORE, getAll, get, put, remove, bulkPut, removeMany } from './database.js';
import { uuid, nowIso } from '../utils/id.js';

/** Estados posibles de un producto. */
export const STATUS = { AVAILABLE: 'available', OUT: 'out' };

/** Sugerencias de presentación (el campo es de texto libre). */
export const UNIT_SUGGESTIONS = [
  'unidad', 'paquete', 'bolsa', 'caja', 'botella', 'lata', 'frasco',
  '1 libra', '1 kilo', '1 litro', 'docena', 'rollo', 'par',
];

/** Crea un producto con todos los campos del esquema y sus valores por defecto. */
export function createProduct(data = {}) {
  const ts = nowIso();
  const status = data.status === STATUS.OUT ? STATUS.OUT : STATUS.AVAILABLE;
  const price = data.referencePrice;
  return {
    id: data.id || uuid(),
    name: (data.name || '').trim(),
    categoryId: data.categoryId || null,
    storeId: data.storeId || null,          // comercio donde se compra habitualmente
    unit: (data.unit || '').trim(),         // presentación: «1 litro», «bolsa de 5 lb»…
    status,
    referencePrice: price === '' || price == null || !isFinite(Number(price)) ? null : Number(price),
    notes: data.notes || '',
    hasPhoto: !!data.hasPhoto,
    lastPurchasedAt: data.lastPurchasedAt || null,
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

/** Guarda sin normalizar (usado por importación y ajustes internos). */
export async function putProduct(record) {
  await put(STORE.PRODUCTS, record);
  return record;
}

export const deleteProduct = (id) => remove(STORE.PRODUCTS, id);
export const deleteProducts = (ids) => removeMany(STORE.PRODUCTS, ids);
export const bulkPutProducts = (list) => bulkPut(STORE.PRODUCTS, list);
