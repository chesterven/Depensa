/**
 * Presupuestos de compra: generación desde la lista, segmentación por comercio,
 * sugerencia automática del comercio más económico y ahorro estimado.
 */
import { getSetting, setSetting } from '../database/settings.js';
import { state, refresh } from '../state.js';
import { bestStoreFor, statsByStoreFor, suggestedPrice, productPriceStats } from './price-service.js';
import { registerPurchase } from './purchase-service.js';
import { round, toNumber } from '../utils/format.js';
import { uuid, nowIso } from '../utils/id.js';

const BUDGET_KEY = 'budget';

export function createBudgetItem(data = {}) {
  return {
    id: data.id || uuid(),
    productId: data.productId || null,
    name: data.name || '',
    unit: data.unit || 'unidad',
    quantity: Math.max(0, toNumber(data.quantity, 1)),
    unitPrice: data.unitPrice == null ? null : round(toNumber(data.unitPrice, 0), 4),
    storeId: data.storeId || null,
    autoStore: data.autoStore !== false,
  };
}

export function createBudget(data = {}) {
  return {
    id: data.id || uuid(),
    name: data.name || 'Presupuesto',
    items: (data.items || []).map(createBudgetItem),
    createdAt: data.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
}

export async function loadBudget() {
  const stored = await getSetting(BUDGET_KEY, null);
  return stored ? createBudget(stored) : null;
}

export async function saveBudget(budget) {
  const record = createBudget(budget);
  await setSetting(BUDGET_KEY, record);
  return record;
}

export async function clearBudget() {
  await setSetting(BUDGET_KEY, null);
}

/** Construye un presupuesto a partir de los elementos pendientes de la lista de compras. */
export function budgetFromShoppingList(selectedIds = null) {
  const items = state.shoppingList
    .filter((item) => item.status === 'pending')
    .filter((item) => !selectedIds || selectedIds.includes(item.id))
    .map((item) => {
      const product = state.productsById.get(item.productId);
      const best = item.productId ? bestStoreFor(item.productId) : null;
      const storeId = item.storeId || best?.storeId || null;
      return createBudgetItem({
        productId: item.productId,
        name: item.name || product?.name || 'Producto',
        unit: product?.unit || 'unidad',
        quantity: item.quantity,
        storeId,
        autoStore: !item.storeId,
        unitPrice: item.estimatedPrice ?? (item.productId ? suggestedPrice(item.productId, storeId) : null),
      });
    });
  return createBudget({ name: 'Compra del ' + new Date().toLocaleDateString('es-SV'), items });
}

/** Precio estimado de un artículo en un comercio concreto. */
export function estimatePrice(productId, storeId) {
  if (!productId) return null;
  return suggestedPrice(productId, storeId);
}

/**
 * Calcula el presupuesto: subtotales por comercio, total general y ahorro estimado.
 * El ahorro compara el comercio asignado contra el más caro con historial.
 */
export function computeBudget(budget) {
  const groups = new Map();
  let total = 0;
  let savings = 0;
  let missingPrice = 0;

  for (const item of budget?.items || []) {
    const quantity = Number(item.quantity) || 0;
    const unitPrice = Number(item.unitPrice);
    const hasPrice = isFinite(unitPrice) && unitPrice > 0;
    const subtotal = hasPrice ? round(unitPrice * quantity, 2) : 0;
    if (!hasPrice) missingPrice += 1;
    total = round(total + subtotal, 2);

    const key = item.storeId || '__none__';
    if (!groups.has(key)) {
      groups.set(key, {
        storeId: item.storeId || null,
        storeName: state.storesById.get(item.storeId)?.name || 'Sin asignar',
        items: [],
        subtotal: 0,
        count: 0,
      });
    }
    const group = groups.get(key);
    group.items.push({ ...item, subtotal, hasPrice });
    group.subtotal = round(group.subtotal + subtotal, 2);
    group.count += 1;

    if (item.productId && hasPrice) {
      const rows = statsByStoreFor(item.productId).filter((r) => r.avg != null && r.storeId);
      if (rows.length > 1) {
        const worst = rows[rows.length - 1];
        const diff = worst.avg - unitPrice;
        if (diff > 0) savings = round(savings + diff * quantity, 2);
      }
    }
  }

  const list = [...groups.values()].sort((a, b) => {
    if (!a.storeId) return 1;
    if (!b.storeId) return -1;
    return b.subtotal - a.subtotal;
  });

  return {
    groups: list,
    total,
    savings,
    missingPrice,
    itemCount: (budget?.items || []).length,
    unitCount: round((budget?.items || []).reduce((sum, i) => sum + (Number(i.quantity) || 0), 0), 2),
    storeCount: list.filter((g) => g.storeId).length,
  };
}

/** Reasigna automáticamente cada artículo al comercio con mejor precio promedio. */
export function autoAssignStores(budget) {
  const items = budget.items.map((item) => {
    if (!item.productId) return item;
    const best = bestStoreFor(item.productId);
    if (!best) return item;
    return {
      ...item,
      storeId: best.storeId,
      autoStore: true,
      unitPrice: suggestedPrice(item.productId, best.storeId) ?? item.unitPrice,
    };
  });
  return { ...budget, items };
}

/** Sugerencia visible en la interfaz: «Recomendado: Supermercado A». */
export function storeRecommendation(productId) {
  const best = bestStoreFor(productId);
  if (!best) return null;
  const general = productPriceStats(productId);
  return {
    ...best,
    generalAverage: general.avg,
    better: general.avg != null && best.avg != null ? round(general.avg - best.avg, 2) : 0,
  };
}

/** Registra como compras todos los artículos de un grupo (un comercio) del presupuesto. */
export async function registerGroupPurchases(budget, storeId, { purchaseDate } = {}) {
  const items = budget.items.filter((item) => (item.storeId || null) === (storeId || null));
  let registered = 0;
  for (const item of items) {
    if (!item.productId || !(Number(item.unitPrice) > 0)) continue;
    await registerPurchase({
      productId: item.productId,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      storeId: item.storeId,
      purchaseDate,
      notes: 'Registrada desde el presupuesto',
    });
    registered += 1;
  }
  const remaining = budget.items.filter((item) => !items.includes(item) || !item.productId || !(Number(item.unitPrice) > 0));
  const next = await saveBudget({ ...budget, items: remaining });
  await refresh(['products', 'purchases', 'shoppingList']);
  return { registered, budget: next };
}
