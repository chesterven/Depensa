/**
 * Datos de demostración.
 * Todos los registros quedan marcados con `demo: true` para poder eliminarlos
 * con un solo toque sin tocar la información real del usuario.
 */
import * as productsDb from '../database/products.js';
import * as storesDb from '../database/stores.js';
import * as listDb from '../database/shopping-list.js';
import { ensureDefaultCategories, listCategories } from '../database/categories.js';
import { saveAppSettings } from '../database/settings.js';
import { state, refresh } from '../state.js';
import { syncShoppingForProduct, STATUS } from './inventory-service.js';
import { normalize } from '../utils/format.js';

const DEMO_STORES = [
  { name: 'Supermercado A', address: 'Boulevard principal', notes: 'Mejores precios en lácteos y limpieza.' },
  { name: 'Supermercado B', address: 'Centro comercial', notes: '' },
  { name: 'Tienda local', address: 'A la vuelta de casa', notes: 'Para emergencias.' },
  { name: 'Mercado', address: 'Mercado municipal', notes: 'Frutas, verduras y granos.' },
];

/** store: índice dentro de DEMO_STORES · out: empieza agotado */
const DEMO_PRODUCTS = [
  { name: 'Arroz', category: 'Alimentos', unit: '1 libra', store: 3, price: 0.95 },
  { name: 'Frijoles', category: 'Alimentos', unit: '1 libra', store: 3, price: 1.25 },
  { name: 'Leche entera', category: 'Alimentos', unit: '1 litro', store: 0, price: 1.30, out: true },
  { name: 'Huevos', category: 'Alimentos', unit: 'docena', store: 3, price: 3.10 },
  { name: 'Café', category: 'Bebidas', unit: 'paquete', store: 1, price: 4.60, out: true },
  { name: 'Azúcar', category: 'Alimentos', unit: '1 libra', store: 3, price: 0.85 },
  { name: 'Papel higiénico', category: 'Higiene personal', unit: 'paquete de 4', store: 1, price: 6.50 },
  { name: 'Detergente', category: 'Limpieza', unit: 'bolsa', store: 0, price: 5.40, out: true },
  { name: 'Pasta dental', category: 'Higiene personal', unit: 'unidad', store: 0, price: 2.40 },
  { name: 'Shampoo', category: 'Higiene personal', unit: 'botella', store: 1, price: 4.90 },
];

export async function isDemoLoaded() {
  const products = await productsDb.listProducts();
  return products.some((product) => product.demo);
}

/** Carga productos y comercios de ejemplo. */
export async function loadDemoData() {
  await ensureDefaultCategories();
  const categories = await listCategories();
  const categoryByName = new Map(categories.map((c) => [normalize(c.name), c]));

  const stores = [];
  for (const data of DEMO_STORES) {
    stores.push(await storesDb.saveStore({ ...data, demo: true }));
  }

  const products = [];
  for (const data of DEMO_PRODUCTS) {
    products.push(await productsDb.saveProduct({
      name: data.name,
      categoryId: categoryByName.get(normalize(data.category))?.id || null,
      storeId: stores[data.store]?.id || null,
      unit: data.unit,
      referencePrice: data.price,
      status: data.out ? STATUS.OUT : STATUS.AVAILABLE,
      notes: '',
      demo: true,
    }));
  }

  await refresh(['products', 'stores', 'categories', 'shoppingList'], { silent: true });
  for (const product of products) {
    await syncShoppingForProduct(product.id, { force: true });
  }
  await saveAppSettings({ demoLoaded: true });
  await refresh();
  return { products: products.length, stores: stores.length };
}

/** Elimina únicamente los registros de demostración. */
export async function removeDemoData() {
  const [products, stores, items] = await Promise.all([
    productsDb.listProducts(),
    storesDb.listStores(),
    listDb.listShoppingItems(),
  ]);
  const demoProductIds = new Set(products.filter((p) => p.demo).map((p) => p.id));
  const demoStoreIds = new Set(stores.filter((s) => s.demo).map((s) => s.id));
  const itemIds = items.filter((i) => demoProductIds.has(i.productId)).map((i) => i.id);

  if (itemIds.length) await listDb.deleteShoppingItems(itemIds);
  if (demoProductIds.size) await productsDb.deleteProducts([...demoProductIds]);
  for (const storeId of demoStoreIds) await storesDb.deleteStore(storeId);

  await saveAppSettings({ demoLoaded: false });
  await refresh();
  return { products: demoProductIds.size, stores: demoStoreIds.size };
}

export function demoCounts() {
  return {
    products: state.products.filter((p) => p.demo).length,
    stores: state.stores.filter((s) => s.demo).length,
  };
}
