# Despensa · Control de productos del hogar

Aplicación web **PWA** para llevar el control de lo que hay en casa: qué productos tienes, dónde se
compra cada uno, qué se agotó y qué falta comprar.

- **100 % client-side**: no hay servidor, ni API, ni base de datos remota, ni cuentas de usuario.
- **Funciona sin conexión** una vez cargada (service worker + precarga de recursos).
- **Los datos viven en el dispositivo** (IndexedDB). Se comparten entre miembros del hogar exportando
  e importando un archivo JSON.
- **Instalable** en Android, iPhone/iPad y computadoras con navegador compatible.

## Cómo funciona

1. Registras los productos de tu hogar, con su **comercio habitual**, presentación, categoría y un
   **precio de referencia** opcional.
2. Cuando algo se acaba lo marcas como **agotado** y pasa solo a la **lista de compras**.
3. Al comprarlo, un toque en **Comprado** lo devuelve al inventario como disponible y lo saca de la
   lista. Cada acción puede deshacerse desde el aviso que aparece abajo.

No hay registro de compras periódicas ni historial de precios: solo el estado actual de la despensa.

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

## Secciones

| Sección | Qué hace |
|---|---|
| **Inicio** | Cuántos productos hay, cuántos están agotados, lista rápida con un toque para marcar comprado y últimos productos comprados. |
| **Inventario** | Búsqueda instantánea, filtros por estado y categoría, orden por nombre/estado/comercio y botón de existencia en cada tarjeta. |
| **Lista de compras** | Se llena sola con lo agotado. Cantidad, comercio, total estimado, agrupación por comercio y opción de compartirla como texto. |
| **Más** | Comercios, categorías, copia de seguridad, ajustes, privacidad, tema claro/oscuro, instalación y datos de demostración. |

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
│   │   ├── products.js  stores.js  categories.js  shopping-list.js
│   │   ├── settings.js         Configuración (IndexedDB) y preferencias (localStorage)
│   │   └── photos.js           Fotos comprimidas de productos
│   ├── services/               Lógica de negocio
│   │   ├── inventory-service.js   Estados, comercio, sincronización con la lista
│   │   ├── shopping-service.js    Lista de compras y deshacer
│   │   ├── backup-service.js      Exportar / importar / compartir JSON
│   │   └── demo-data.js           Datos de demostración
│   ├── components/
│   │   ├── ui/                 Sheets, toasts, confirmaciones, formularios
│   │   ├── views/              Una vista por pantalla
│   │   └── *-form.js           Formularios reutilizables (producto, comercio, categoría, artículo)
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

Base de datos `despensa-hogar`, versión 2.

| Tabla | Clave | Campos |
|---|---|---|
| `products` | `id` | name, categoryId, **storeId** (comercio habitual), unit (presentación), **status** (`available` / `out`), **referencePrice**, notes, hasPhoto, lastPurchasedAt, createdAt, updatedAt |
| `stores` | `id` | name, address, notes, createdAt, updatedAt |
| `categories` | `id` | name, icon, color, createdAt |
| `shoppingList` | `id` | productId, name, quantity, estimatedPrice, storeId, status, auto, createdAt, updatedAt |
| `settings` | `key` | configuración de la app |
| `photos` | `id` (= id del producto) | dataUrl comprimido, updatedAt |

`localStorage` solo guarda preferencias pequeñas de interfaz: tema, últimos filtros usados y
agrupación de la lista.

### Migraciones

`js/database/database.js` aplica migraciones incrementales. La versión 2 elimina la tabla de compras
y convierte cada producto al nuevo esquema: la cantidad pasa a estado (`0` → agotado), el último
comercio del historial se guarda como comercio habitual y el precio promedio se conserva como precio
de referencia. **Ningún producto se pierde al actualizar.**

Para una versión futura basta con subir `DB_VERSION` y añadir un bloque:

```js
if (oldVersion < 3) {
  // crear índices o transformar registros existentes
}
```

---

## Reglas de negocio

- Un producto está **Con existencia** o **Agotado**.
- Al marcarlo agotado entra automáticamente en la lista de compras con su comercio y precio de
  referencia (se puede desactivar en Ajustes).
- Al marcarlo comprado vuelve a estar disponible, se guarda la fecha y sale de la lista.
- Agregar un producto a la lista manualmente lo marca como agotado; quitarlo de la lista no cambia
  su estado.
- Si escribes en la lista un producto que no existe, se crea en el inventario como agotado.
- Al eliminar un comercio, sus productos quedan «sin comercio» (no se borran).

---

## Copia de seguridad y sincronización entre dispositivos

No hay nube: el archivo JSON es el mecanismo de sincronización.

1. En un dispositivo: **Más → Copia de seguridad → Exportar** (o **Compartir datos**, que usa la
   Web Share API: WhatsApp, Telegram, AirDrop, correo, Drive, Archivos…).
2. En el otro dispositivo: **Más → Copia de seguridad → Seleccionar archivo**.
3. Se muestra un resumen (productos, comercios, categorías encontrados) y se elige:
   - **Combinar**: agrega lo nuevo y evita duplicados (por id y por nombre).
   - **Reemplazar**: deja solo la información del archivo.

El archivo se llama `inventario-hogar-AAAA-MM-DD.json`. Los respaldos de la versión anterior (con
historial de compras) también se pueden importar: la app avisa y convierte cada producto conservando
su comercio y su precio de referencia.

La lista de compras también puede compartirse como texto plano desde su menú, ideal para enviarla por
WhatsApp a quien vaya a la tienda.

---

## Mantenimiento

Al agregar, renombrar o eliminar archivos estáticos, actualiza la lista de precarga del service
worker:

```bash
node tools/update-precache.mjs
```

Y cambia `VERSION` en `service-worker.js` (y `APP_VERSION` en `js/app-info.js`) para que los
dispositivos reciban la actualización. La app avisa al usuario con «Hay una versión nueva disponible».

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
