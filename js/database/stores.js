/** Acceso a datos de comercios. */
import { STORE, getAll, get, put, remove, bulkPut } from './database.js';
import { uuid, nowIso } from '../utils/id.js';

export function createStore(data = {}) {
  const ts = nowIso();
  return {
    id: data.id || uuid(),
    name: (data.name || '').trim(),
    address: data.address || '',
    notes: data.notes || '',
    color: data.color || null,
    createdAt: data.createdAt || ts,
    updatedAt: data.updatedAt || ts,
    ...(data.demo ? { demo: true } : {}),
  };
}

export const listStores = () => getAll(STORE.STORES);
export const getStore = (id) => get(STORE.STORES, id);

export async function saveStore(data) {
  const record = createStore({ ...data, updatedAt: nowIso() });
  await put(STORE.STORES, record);
  return record;
}

export const deleteStore = (id) => remove(STORE.STORES, id);
export const bulkPutStores = (list) => bulkPut(STORE.STORES, list);
