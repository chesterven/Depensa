/**
 * Hogar: una fila por cuenta, con las preferencias compartidas entre dispositivos.
 */
import { getClient, describeError } from './client.js';

function fromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    expiryWarningDays: row.expiry_warning_days ?? 7,
    currencySymbol: row.currency_symbol || '$',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Devuelve el hogar de la cuenta. Si la cuenta se creó antes de instalar el
 * esquema, lo crea con la función del servidor (y sus categorías iniciales).
 */
export async function ensureHousehold(userId) {
  const client = getClient();
  const { data, error } = await client.from('households').select('*').limit(1);
  if (error) throw new Error(describeError(error));
  if (data && data.length) return fromRow(data[0]);

  const { error: rpcError } = await client.rpc('create_household_for_user', { user_id: userId });
  if (rpcError) throw new Error(describeError(rpcError));

  const { data: created, error: reloadError } = await client.from('households').select('*').limit(1);
  if (reloadError) throw new Error(describeError(reloadError));
  if (!created?.length) throw new Error('No se pudo preparar el hogar en la base de datos.');
  return fromRow(created[0]);
}

export async function updateHousehold(id, patch) {
  const row = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.expiryWarningDays !== undefined) row.expiry_warning_days = patch.expiryWarningDays;
  if (patch.currencySymbol !== undefined) row.currency_symbol = patch.currencySymbol;

  const { data, error } = await getClient().from('households').update(row).eq('id', id).select().single();
  if (error) throw new Error(describeError(error));
  return fromRow(data);
}

export { fromRow as householdFromRow };
