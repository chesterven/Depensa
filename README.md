# Despensa · Control de productos del hogar

Aplicación web **PWA** para llevar el control de los productos que se compran y consumen en un hogar:
inventario, lista de compras automática, historial de precios por comercio, presupuestos segmentados
y estadísticas de gasto.

- **100 % client-side**: no hay servidor, ni API, ni base de datos remota, ni cuentas de usuario.
- **Funciona sin conexión** una vez cargada (service worker + precarga de recursos).
- **Los datos viven en el dispositivo** (IndexedDB). Se comparten entre miembros del hogar exportando
  e importando un archivo JSON.
- **Instalable** en Android, iPhone/iPad y computadoras con navegador compatible.

---

## Cómo ejecutarla localmente

La aplicación necesita servirse por HTTP (el service worker y los módulos ES no funcionan con `file://`).

```bash
# Opción 1 — Python (ya incluido en macOS y Linux)
cd despensa
python3 -m http.server 8080

# Opción 2 — Node
npx serve .
```

Luego abre <http://localhost:8080> en el navegador.

Para probarla en el teléfono dentro de la misma red Wi-Fi, usa la IP de tu computadora
(`http://192.168.x.x:8080`). Ten en cuenta que la instalación como app y el service worker requieren
`https://` o `localhost`; para pruebas en el teléfono puedes usar un túnel (por ejemplo `ngrok`) o
desplegarla.

## Cómo desplegarla

Es un sitio estático: sube el contenido de la carpeta tal cual a cualquier hosting.

- **GitHub Pages**: sube el proyecto a un repositorio y activa Pages. Funciona en subcarpetas
  (todas las rutas son relativas).
- **Netlify / Vercel / Cloudflare Pages**: arrastra la carpeta; sin build ni configuración.
- **Servidor propio**: copia los archivos al directorio público.

Requisito: servir por **HTTPS** para que se pueda instalar y funcione offline.

---

## Estructura del proyecto

```text
/
├── index.html                  Shell de la aplicación
├── manifest.json               Metadatos PWA (iconos, atajos, colores)
├── service-worker.js           Precarga y estrategia offline
├── css/
│   ├── styles.css              Sistema de diseño (tokens, componentes, temas)
│   └── responsive.css          Adaptaciones por tamaño de pantalla
├── js/
│   ├── app.js                  Arranque, shell, navegación inferior, service worker
│   ├── router.js               Enrutador por hash (#/ruta)
│   ├── state.js                Caché en memoria + suscripciones de las vistas
│   ├── theme.js                Tema claro / oscuro / automático
│   ├── install.js              Instalación de la PWA
│   ├── database/               Acceso a IndexedDB (una tabla por archivo)
│   │   ├── database.js         Apertura, versionado y migraciones
│   │   ├── products.js  purchases.js  stores.js
│   │   ├── categories.js  shopping-list.js
│   │   ├── settings.js         Configuración (IndexedDB) y preferencias (localStorage)
│   │   └── photos.js           Fotos comprimidas de productos
│   ├── services/               Lógica de negocio
│   │   ├── inventory-service.js   Estados, cantidades, sincronización con la lista
│   │   ├── purchase-service.js    Registro de compras e historial
│   │   ├── price-service.js       Promedios, mínimos, máximos y comparación de comercios
│   │   ├── budget-service.js      Presupuestos y segmentación por comercio
│   │   ├── stats-service.js       Gastos por período, categoría y comercio
│   │   ├── shopping-service.js    Lista de compras
│   │   ├── backup-service.js      Exportar / importar / compartir JSON
│   │   └── demo-data.js           Datos de demostración
│   ├── components/
│   │   ├── ui/                 Sheets, toasts, confirmaciones, gráficas, formularios
│   │   ├── views/              Una vista por pantalla
│   │   └── *-form.js           Formularios reutilizables (producto, compra, comercio…)
│   └── utils/                  DOM, formato, fechas, iconos SVG, identificadores
├── assets/
│   ├── fonts/                  Tipografías autoalojadas (funcionan sin Internet)
│   └── icons/                  Iconos e imágenes de inicio (Android / iOS)
└── tools/
    └── update-precache.mjs     Regenera la lista de archivos del service worker
```

Separación de responsabilidades: **base de datos → servicios → interfaz**. Ninguna vista habla
directamente con IndexedDB.

---

## Modelo de datos (IndexedDB)

Base de datos `despensa-hogar`, versión 1.

| Tabla | Clave | Campos principales |
|---|---|---|
| `products` | `id` | name, categoryId, unit, currentQuantity, minimumQuantity, notes, hasPhoto, lastPurchaseDate, lastStoreId, lastPrice, avgPrice, minPrice, maxPrice, purchaseCount, createdAt, updatedAt |
| `purchases` | `id` | productId, productName, categoryId, storeId, storeName, quantity, unitPrice, totalPrice, purchaseDate, notes, createdAt |
| `stores` | `id` | name, address, notes, createdAt, updatedAt |
| `categories` | `id` | name, icon, color, createdAt |
| `shoppingList` | `id` | productId, name, quantity, estimatedPrice, storeId, status, auto, createdAt, updatedAt |
| `settings` | `key` | configuración de la app y presupuesto activo |
| `photos` | `id` (= id del producto) | dataUrl comprimido, updatedAt |

`localStorage` solo guarda preferencias pequeñas de interfaz: tema, últimos filtros usados y
agrupación de la lista.

### Migraciones

`js/database/database.js` aplica migraciones incrementales. Para una versión futura basta con
subir `DB_VERSION` y añadir un bloque:

```js
if (oldVersion < 2) {
  // crear índices o transformar registros existentes
}
```

Los datos del usuario nunca se borran al actualizar la aplicación.

---

## Reglas de negocio

- **Estados del producto**: `Disponible` (cantidad > mínimo) · `Por comprar` (cantidad ≤ mínimo)
  · `Agotado` (cantidad = 0).
- Al llegar a **0** o quedar **por debajo del mínimo**, el producto entra automáticamente en la
  lista de compras (se puede desactivar en Ajustes).
- Al **registrar una compra** se crea el historial, se suma la cantidad al inventario, se actualiza
  el último precio, se recalculan promedio/mínimo/máximo, se registra el comercio y el producto sale
  de la lista.
- **Precio promedio** = media de los precios unitarios registrados. Se calcula también por comercio,
  lo que permite recomendar dónde conviene comprar cada producto.
- **Presupuesto**: toma los artículos pendientes, asigna el comercio más económico según el historial
  y agrupa los subtotales por comercio, mostrando el ahorro estimado.
- Al **eliminar un producto o un comercio** se conserva su historial de compras (cada compra guarda
  el nombre en el momento del registro).

---

## Copia de seguridad y sincronización entre dispositivos

No hay nube: el archivo JSON es el mecanismo de sincronización.

1. En un dispositivo: **Más → Copia de seguridad → Exportar** (o **Compartir datos**, que usa la
   Web Share API: WhatsApp, Telegram, AirDrop, correo, Drive, Archivos…).
2. En el otro dispositivo: **Más → Copia de seguridad → Seleccionar archivo**.
3. Se muestra un resumen (productos, compras, comercios encontrados) y se elige:
   - **Combinar**: agrega lo nuevo, evita duplicados y conserva el historial de ambos.
   - **Reemplazar**: deja solo la información del archivo.

El archivo se llama `inventario-hogar-AAAA-MM-DD.json` e incluye productos, categorías, comercios,
historial, lista de compras, configuración y (opcionalmente) las fotografías.

---

## Mantenimiento

Al agregar, renombrar o eliminar archivos estáticos, actualiza la lista de precarga del service
worker y sube la versión:

```bash
node tools/update-precache.mjs
```

Y cambia `VERSION` en `service-worker.js` (y `APP_VERSION` en `js/app-info.js`) para que los
dispositivos reciban la actualización. La app avisa al usuario con un aviso «Hay una versión nueva
disponible».

---

## Notas técnicas

- Sin frameworks ni dependencias externas en tiempo de ejecución: HTML5, CSS3 y JavaScript ES6+
  con módulos nativos.
- Tipografías **Fraunces** y **Hanken Grotesk** autoalojadas (SIL Open Font License) para que la
  interfaz se vea igual sin conexión.
- Iconos SVG en línea dibujados en el propio código (`js/utils/icons.js`).
- Compatible con Chrome, Edge, Safari (iOS 15+), Firefox y Samsung Internet.
- Accesibilidad: HTML semántico, etiquetas asociadas, roles ARIA en diálogos e interruptores,
  objetivos táctiles ≥ 44 px, navegación por teclado, foco visible y estados que no dependen solo
  del color.

## Privacidad

Todos los datos se almacenan localmente en el dispositivo. La aplicación no envía información a
ningún servidor, no usa cuentas, analítica ni publicidad, y no hace ninguna petición de red después
de cargarse.
