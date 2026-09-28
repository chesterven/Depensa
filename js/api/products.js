/** Productos del hogar. */
import { getClient, describeError } from './client.js';

export function fromRow(row) {
  return {
    id: row.id,
    householdId: row.household_id,
    name: row.name,
    categoryId: row.category_id,
    storeId: row.store_id,
    unit: row.unit || '',
    inStock: !!row.in_stock,
    tracksExpiry: !!row.tracks_expiry,
    expiresOn: row.expires_on || null,
    referencePrice: row.reference_price == null ? null : Number(row.reference_price),
    notes: row.notes || '',
    photoPath: row.photo_path || null,
    purchasedOn: row.purchased_on || null,
    statusChangedAt: row.status_changed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(product) {
  const row = {};
  const map = {
    name: 'name',
    categoryId: 'category_id',
    storeId: 'store_id',
    unit: 'unit',
    inStock: 'in_stock',
    tracksExpiry: 'tracks_expiry',
    expiresOn: 'expires_on',
    referencePrice: 'reference_price',
    notes: 'notes',
    photoPath: 'photo_path',
    purchasedOn: 'purchased_on',
  };
  for (const [key, column] of Object.entries(map)) {
    if (product[key] !== undefined) row[column] = product[key];
  }
  return row;
}

export async function listProducts(householdId) {
  const { data, error } = await getClient()
    .from('products')
    .select('*')
    .eq('household_id', householdId)
    .order('name', { ascending: true });
  if (error) throw new Error(describeError(error));
  return (data || []).map(fromRow);
}

export async function createProduct(householdId, product) {
  const { data, error } = await getClient()
    .from('products')
    .insert({ ...toRow(product), household_id: householdId })
    .select()
    .single();
  if (error) throw new Error(describeError(error));
  return fromRow(data);
}

export async function updateProduct(id, patch) {
  const { data, error } = await getClient()
    .from('products')
    .update(toRow(patch))
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(describeError(error));
  return fromRow(data);
}

export async function deleteProduct(id) {
  const { error } = await getClient().from('products').delete().eq('id', id);
  if (error) throw new Error(describeError(error));
  return true;
}

/** Cambia solo la existencia (la operación más frecuente de la app). */
export async function setStock(id, inStock, extra = {}) {
  return updateProduct(id, { inStock, ...extra });
}

/** Alta masiva, usada al cargar el ejemplo o importar un respaldo. */
export async function createProducts(householdId, products) {
  if (!products.length) return [];
  const rows = products.map((product) => ({ ...toRow(product), household_id: householdId }));
  const { data, error } = await getClient().from('products').insert(rows).select();
  if (error) throw new Error(describeError(error));
  return (data || []).map(fromRow);
}
