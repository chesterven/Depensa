/** Productos de ejemplo para ver la app funcionando. */
import { state, refreshProducts } from '../state.js';
import { createProducts } from '../api/products.js';
import { createStores, listStores } from '../api/catalog.js';
import { setCatalogLocal } from '../state.js';
import { normalize } from '../utils/format.js';
import { todayKey } from '../utils/date.js';

const STORES = ['Supermercado A', 'Mercado', 'Farmacia'];

/** days: null = sin fecha · número = vence en tantos días */
const PRODUCTS = [
  { name: 'Leche entera', category: 'Alimentos', unit: '1 litro', store: 0, price: 1.30, days: 6, inStock: true },
  { name: 'Huevos', category: 'Alimentos', unit: 'docena', store: 1, price: 3.10, days: 20, inStock: true },
  { name: 'Arroz', category: 'Alimentos', unit: '1 libra', store: 1, price: 0.95, days: 300, inStock: true },
  { name: 'Frijoles', category: 'Alimentos', unit: '1 libra', store: 1, price: 1.25, days: null, inStock: false },
  { name: 'Yogur', category: 'Alimentos', unit: 'vaso', store: 0, price: 0.80, days: -2, inStock: true },
  { name: 'Café', category: 'Bebidas', unit: 'paquete', store: 0, price: 4.60, days: 120, inStock: false },
  { name: 'Jugo de naranja', category: 'Bebidas', unit: '1 litro', store: 0, price: 2.10, days: 3, inStock: true },
  { name: 'Acetaminofén', category: 'Medicina', unit: 'caja de 20', store: 2, price: 2.50, days: 400, inStock: true },
  { name: 'Alcohol gel', category: 'Medicina', unit: 'botella', store: 2, price: 3.00, days: null, inStock: true },
  { name: 'Detergente', category: 'Aseo del hogar', unit: 'bolsa', store: 0, price: 5.40, days: null, inStock: false },
  { name: 'Cloro', category: 'Aseo del hogar', unit: '1 galón', store: 0, price: 2.20, days: null, inStock: true },
  { name: 'Papel higiénico', category: 'Aseo del hogar', unit: 'paquete de 4', store: 0, price: 6.50, days: null, inStock: true },
  { name: 'Pasta dental', category: 'Aseo personal', unit: 'unidad', store: 0, price: 2.40, days: null, inStock: true },
  { name: 'Shampoo', category: 'Aseo personal', unit: 'botella', store: 0, price: 4.90, days: null, inStock: false },
  { name: 'Jabón de baño', category: 'Aseo personal', unit: 'pastilla', store: 1, price: 0.90, days: null, inStock: true },
];

function dateIn(days) {
  if (days == null) return null;
  const date = new Date();
  date.setDate(date.getDate() + days);
  return todayKey(date);
}

export async function loadDemo() {
  const household = state.household;
  if (!household) throw new Error('Primero inicia sesión.');

  // Comercios que falten
  const existing = new Map(state.stores.map((s) => [normalize(s.name), s]));
  const missing = STORES.filter((name) => !existing.has(normalize(name)));
  if (missing.length) {
    await createStores(household.id, missing.map((name) => ({ name })));
    const stores = await listStores(household.id);
    setCatalogLocal({ stores });
    stores.forEach((store) => existing.set(normalize(store.name), store));
  }

  const categoryByName = new Map(state.categories.map((c) => [normalize(c.name), c]));
  const taken = new Set(state.products.map((p) => normalize(p.name)));

  const rows = PRODUCTS
    .filter((item) => !taken.has(normalize(item.name)))
    .map((item) => {
      const category = categoryByName.get(normalize(item.category));
      return {
        name: item.name,
        categoryId: category?.id || null,
        storeId: existing.get(normalize(STORES[item.store]))?.id || null,
        unit: item.unit,
        inStock: item.inStock,
        tracksExpiry: item.days != null,
        expiresOn: dateIn(item.days),
        referencePrice: item.price,
        notes: '',
      };
    });

  if (rows.length) await createProducts(household.id, rows);
  await refreshProducts();
  return { products: rows.length };
}
