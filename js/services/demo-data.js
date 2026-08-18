/**
 * Datos de demostración.
 * Todos los registros quedan marcados con `demo: true` para poder eliminarlos
 * con un solo toque sin tocar la información real del usuario.
 */
import * as productsDb from '../database/products.js';
import * as purchasesDb from '../database/purchases.js';
import * as storesDb from '../database/stores.js';
import * as listDb from '../database/shopping-list.js';
import { ensureDefaultCategories, listCategories } from '../database/categories.js';
import { saveAppSettings } from '../database/settings.js';
import { state, refresh } from '../state.js';
import { recalcProductStats, syncShoppingForProduct } from './inventory-service.js';
import { normalize, round } from '../utils/format.js';
import { todayKey } from '../utils/date.js';

const DEMO_STORES = [
  { name: 'Supermercado A', address: 'Boulevard principal', notes: 'Suele tener mejores precios en lácteos.' },
  { name: 'Supermercado B', address: 'Centro comercial', notes: '' },
  { name: 'Tienda local', address: 'A la vuelta de casa', notes: 'Para emergencias.' },
  { name: 'Mercado', address: 'Mercado municipal', notes: 'Frutas, verduras y granos.' },
];

/** factor de precio por comercio: [Super A, Super B, Tienda local, Mercado] */
const DEMO_PRODUCTS = [
  { name: 'Arroz', category: 'Alimentos', unit: 'libra', current: 4, min: 2, base: 0.95, factors: [1, 1.08, 1.18, 0.9] },
  { name: 'Frijoles', category: 'Alimentos', unit: 'libra', current: 3, min: 2, base: 1.25, factors: [1, 1.06, 1.2, 0.88] },
  { name: 'Leche entera', category: 'Alimentos', unit: 'litro', current: 0, min: 1, base: 1.3, factors: [0.98, 1.12, 1.16, 1.05] },
  { name: 'Huevos', category: 'Alimentos', unit: 'docena', current: 1, min: 2, base: 3.1, factors: [1, 1.05, 1.15, 0.92] },
  { name: 'Café', category: 'Bebidas', unit: 'paquete', current: 0, min: 1, base: 4.6, factors: [1, 0.95, 1.2, 1.08] },
  { name: 'Azúcar', category: 'Alimentos', unit: 'libra', current: 5, min: 2, base: 0.85, factors: [1, 1.04, 1.14, 0.95] },
  { name: 'Papel higiénico', category: 'Higiene personal', unit: 'paquete', current: 2, min: 1, base: 6.5, factors: [1, 0.93, 1.22, 1.1] },
  { name: 'Detergente', category: 'Limpieza', unit: 'bolsa', current: 1, min: 1, base: 5.4, factors: [1, 0.97, 1.18, 1.02] },
  { name: 'Pasta dental', category: 'Higiene personal', unit: 'unidad', current: 3, min: 1, base: 2.4, factors: [1, 1.02, 1.12, 1.06] },
  { name: 'Shampoo', category: 'Higiene personal', unit: 'botella', current: 2, min: 1, base: 4.9, factors: [1, 0.96, 1.15, 1.09] },
];

/** Generador pseudoaleatorio con semilla, para que la demo sea siempre coherente. */
function seeded(seed) {
  let value = seed;
  return () => {
    value = (value * 1103515245 + 12345) % 2147483648;
    return value / 2147483648;
  };
}

function dateKeyDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return todayKey(d);
}

export async function isDemoLoaded() {
  const products = await productsDb.listProducts();
  return products.some((product) => product.demo);
}

/** Carga productos, comercios e historial ficticio. */
export async function loadDemoData() {
  await ensureDefaultCategories();
  const categories = await listCategories();
  const categoryByName = new Map(categories.map((c) => [normalize(c.name), c]));
  const random = seeded(20260817);

  const stores = [];
  for (const data of DEMO_STORES) {
    stores.push(await storesDb.saveStore({ ...data, demo: true }));
  }

  const products = [];
  for (const data of DEMO_PRODUCTS) {
    const product = await productsDb.saveProduct({
      name: data.name,
      categoryId: categoryByName.get(normalize(data.category))?.id || null,
      unit: data.unit,
      currentQuantity: data.current,
      minimumQuantity: data.min,
      notes: '',
      demo: true,
    });
    products.push({ product, data });
  }

  for (const { product, data } of products) {
    const purchaseCount = 4 + Math.floor(random() * 4); // entre 4 y 7 compras
    for (let i = purchaseCount - 1; i >= 0; i--) {
      const daysAgo = Math.round(i * (200 / purchaseCount) + random() * 5);
      const storeIndex = random() < 0.45 ? 0 : 1 + Math.floor(random() * 3);
      const store = stores[Math.min(storeIndex, stores.length - 1)];
      const inflation = 1 + (purchaseCount - 1 - i) * 0.012; // los precios suben con el tiempo
      const noise = 0.96 + random() * 0.08;
      const unitPrice = round(data.base * data.factors[Math.min(storeIndex, 3)] * inflation * noise, 2);
      const quantity = data.unit === 'libra' ? 1 + Math.floor(random() * 3) : 1 + Math.floor(random() * 2);
      await purchasesDb.savePurchase({
        productId: product.id,
        productName: product.name,
        categoryId: product.categoryId,
        storeId: store.id,
        storeName: store.name,
        quantity,
        unitPrice,
        totalPrice: round(unitPrice * quantity, 2),
        purchaseDate: dateKeyDaysAgo(daysAgo),
        notes: '',
        demo: true,
      });
    }
  }

  await refresh(['products', 'purchases', 'stores', 'categories', 'shoppingList'], { silent: true });
  for (const { product } of products) {
    await recalcProductStats(product.id);
  }
  await refresh(['products', 'purchases'], { silent: true });
  for (const { product } of products) {
    await syncShoppingForProduct(product.id, { force: true });
  }
  await saveAppSettings({ demoLoaded: true });
  await refresh();
  return { products: products.length, stores: stores.length };
}

/** Elimina únicamente los registros de demostración. */
export async function removeDemoData() {
  const [products, purchases, stores, items] = await Promise.all([
    productsDb.listProducts(),
    purchasesDb.listPurchases(),
    storesDb.listStores(),
    listDb.listShoppingItems(),
  ]);
  const demoProductIds = new Set(products.filter((p) => p.demo).map((p) => p.id));
  const demoStoreIds = new Set(stores.filter((s) => s.demo).map((s) => s.id));

  const purchaseIds = purchases
    .filter((p) => p.demo || demoProductIds.has(p.productId))
    .map((p) => p.id);
  const itemIds = items
    .filter((i) => demoProductIds.has(i.productId))
    .map((i) => i.id);

  if (purchaseIds.length) await purchasesDb.deletePurchases(purchaseIds);
  if (itemIds.length) await listDb.deleteShoppingItems(itemIds);
  if (demoProductIds.size) await productsDb.deleteProducts([...demoProductIds]);
  for (const storeId of demoStoreIds) await storesDb.deleteStore(storeId);

  await saveAppSettings({ demoLoaded: false });
  await refresh();
  return { products: demoProductIds.size, purchases: purchaseIds.length, stores: demoStoreIds.size };
}

export function demoCounts() {
  return {
    products: state.products.filter((p) => p.demo).length,
    stores: state.stores.filter((s) => s.demo).length,
    purchases: state.purchases.filter((p) => p.demo).length,
  };
}
