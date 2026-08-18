/** Acceso a datos de categorías. */
import { STORE, getAll, get, put, remove, bulkPut } from './database.js';
import { uuid, nowIso } from '../utils/id.js';

/** Categorías iniciales sugeridas (el usuario puede editarlas o borrarlas). */
export const DEFAULT_CATEGORIES = [
  { name: 'Alimentos', icon: 'jar', color: '#2F7D5B' },
  { name: 'Bebidas', icon: 'drop', color: '#2A7EA8' },
  { name: 'Limpieza', icon: 'sparkles', color: '#7A6BC4' },
  { name: 'Higiene personal', icon: 'drop', color: '#C2557F' },
  { name: 'Mascotas', icon: 'star', color: '#B4762A' },
  { name: 'Cocina', icon: 'scale', color: '#C0602F' },
  { name: 'Farmacia', icon: 'shield', color: '#3E8E7E' },
  { name: 'Otros', icon: 'tag', color: '#6C7684' },
];

export function createCategory(data = {}) {
  const ts = nowIso();
  return {
    id: data.id || uuid(),
    name: (data.name || '').trim(),
    icon: data.icon || 'tag',
    color: data.color || '#6C7684',
    createdAt: data.createdAt || ts,
    updatedAt: data.updatedAt || ts,
  };
}

export const listCategories = () => getAll(STORE.CATEGORIES);
export const getCategory = (id) => get(STORE.CATEGORIES, id);

export async function saveCategory(data) {
  const record = createCategory({ ...data, updatedAt: nowIso() });
  await put(STORE.CATEGORIES, record);
  return record;
}

export const deleteCategory = (id) => remove(STORE.CATEGORIES, id);
export const bulkPutCategories = (list) => bulkPut(STORE.CATEGORIES, list);

/** Inserta las categorías por defecto si la tabla está vacía. */
export async function ensureDefaultCategories() {
  const existing = await listCategories();
  if (existing.length) return existing;
  const records = DEFAULT_CATEGORIES.map((c) => createCategory(c));
  await bulkPutCategories(records);
  return records;
}
