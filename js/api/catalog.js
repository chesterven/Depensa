/** Categorías y comercios del hogar. */
import { getClient, describeError } from './client.js';

export function categoryFromRow(row) {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    icon: row.icon || 'tag',
    color: row.color || '#6C7684',
    tracksExpiry: !!row.tracks_expiry,
    sortOrder: row.sort_order ?? 0,
  };
}

export function storeFromRow(row) {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    notes: row.notes || '',
  };
}

export async function listCategories(householdId) {
  const { data, error } = await getClient()
    .from('categories')
    .select('*')
    .eq('household_id', householdId)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw new Error(describeError(error));
  return (data || []).map(categoryFromRow);
}

export async function saveCategory(householdId, category) {
  const row = {
    name: category.name,
    icon: category.icon || 'tag',
    color: category.color || '#6C7684',
    tracks_expiry: !!category.tracksExpiry,
    sort_order: category.sortOrder ?? 99,
  };
  const client = getClient();
  const query = category.id
    ? client.from('categories').update(row).eq('id', category.id)
    : client.from('categories').insert({ ...row, household_id: householdId });
  const { data, error } = await query.select().single();
  if (error) throw new Error(describeError(error));
  return categoryFromRow(data);
}

export async function deleteCategory(id) {
  const { error } = await getClient().from('categories').delete().eq('id', id);
  if (error) throw new Error(describeError(error));
  return true;
}

export async function listStores(householdId) {
  const { data, error } = await getClient()
    .from('stores')
    .select('*')
    .eq('household_id', householdId)
    .order('name', { ascending: true });
  if (error) throw new Error(describeError(error));
  return (data || []).map(storeFromRow);
}

export async function saveStore(householdId, store) {
  const row = { name: store.name, notes: store.notes || '' };
  const client = getClient();
  const query = store.id
    ? client.from('stores').update(row).eq('id', store.id)
    : client.from('stores').insert({ ...row, household_id: householdId });
  const { data, error } = await query.select().single();
  if (error) throw new Error(describeError(error));
  return storeFromRow(data);
}

export async function deleteStore(id) {
  const { error } = await getClient().from('stores').delete().eq('id', id);
  if (error) throw new Error(describeError(error));
  return true;
}

export async function createCategories(householdId, categories) {
  if (!categories.length) return [];
  const rows = categories.map((c, index) => ({
    household_id: householdId,
    name: c.name,
    icon: c.icon || 'tag',
    color: c.color || '#6C7684',
    tracks_expiry: !!c.tracksExpiry,
    sort_order: c.sortOrder ?? index,
  }));
  const { data, error } = await getClient().from('categories').insert(rows).select();
  if (error) throw new Error(describeError(error));
  return (data || []).map(categoryFromRow);
}

export async function createStores(householdId, stores) {
  if (!stores.length) return [];
  const rows = stores.map((s) => ({ household_id: householdId, name: s.name, notes: s.notes || '' }));
  const { data, error } = await getClient().from('stores').insert(rows).select();
  if (error) throw new Error(describeError(error));
  return (data || []).map(storeFromRow);
}
