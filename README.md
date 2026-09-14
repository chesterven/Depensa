# Despensa · Control de productos del hogar

Aplicación web **PWA** para saber qué hay en casa, qué falta comprar y qué está por vencer.
Ahora la información vive en una **base de datos PostgreSQL (Supabase)**, así que todos los
teléfonos de la casa ven exactamente lo mismo.

- **Sincronizada**: una sola cuenta compartida; lo que cambia un teléfono aparece en los demás.
- **Con fotos**: cada producto puede tener su fotografía, tomada con la cámara.
- **Con vencimientos**: fecha opcional por producto (o «no aplica»), con avisos y filtros.
- **Simple**: la única pregunta es *¿hay o no hay?*; lo que no hay forma la lista de compras.
- **Instalable**: se agrega a la pantalla de inicio en Android, iPhone/iPad y computadoras.

---

## 1. Preparar la base de datos (una sola vez, 10 minutos)

### 1.1 Crear el proyecto

1. Entra a [supabase.com](https://supabase.com) y crea una cuenta gratuita.
2. **New project** → ponle un nombre (por ejemplo `despensa`), elige una contraseña para la base de
   datos (guárdala) y la región más cercana.
3. Espera 1–2 minutos a que el proyecto termine de crearse.

### 1.2 Crear las tablas

1. En el menú lateral abre **SQL Editor** → **New query**.
2. Copia **todo** el contenido del archivo [`supabase/schema.sql`](supabase/schema.sql) y pégalo.
3. Pulsa **Run**. Debe terminar sin errores (los avisos «NOTICE» son normales).

Esto crea las tablas, los índices, las políticas de seguridad, los disparadores y el espacio para
las fotos. Puedes volver a ejecutarlo cuando quieras: no borra información.

### 1.3 (Recomendado) Entrar sin confirmar el correo

Para una cuenta familiar es más cómodo desactivar la confirmación por correo:

**Authentication → Sign In / Providers → Email → Confirm email → apágalo → Save.**

Si prefieres dejarlo encendido, tendrás que abrir el enlace que llegue al correo antes de entrar.

### 1.4 Copiar los datos de conexión

En **Project Settings → API** copia:

| Dato | Dónde se usa |
|---|---|
| **Project URL** (`https://xxxx.supabase.co`) | Pantalla de conexión de la app |
| **anon public** (clave larga que empieza con `eyJ…`) | Pantalla de conexión de la app |

> La clave `anon` está diseñada para vivir en el navegador. Quien la tenga **no** puede leer tus
> datos: las políticas RLS solo permiten ver las filas del hogar de la sesión iniciada.

---

## 2. Poner la aplicación en línea

Es un sitio estático, sin compilación. Sube el contenido de la carpeta tal cual a:

- **Netlify / Vercel / Cloudflare Pages**: arrastra la carpeta y listo.
- **GitHub Pages**: sube el proyecto a un repositorio y actívalo (funciona en subcarpetas).
- **Tu propio servidor**: copia los archivos al directorio público.

Debe servirse por **HTTPS** para instalarse como app y para que funcione la cámara.

Para probar en tu computadora:

```bash
cd despensa
python3 -m http.server 8080    # o:  npx serve .
```

Y abre <http://localhost:8080>.

### Conectar la app

La primera vez, la app muestra la pantalla **«Conecta tu base de datos»**: pega la URL y la clave,
pulsa **Probar conexión** (verifica proyecto, clave, tablas y almacenamiento) y continúa.

Si prefieres que todos los dispositivos queden configurados desde el inicio, escribe esos dos datos
en [`config.js`](config.js) antes de subir la carpeta.

### Crear la cuenta del hogar

En la pantalla de acceso, **Crear la cuenta del hogar** con un correo y una contraseña que
compartirás con tu familia. Cada teléfono inicia sesión una vez y queda listo.

---

## 3. Cómo se usa

1. **Registra** un producto: nombre, foto, categoría y si hay o no hay. Para alimentos y medicinas
   la app activa sola la fecha de vencimiento (con atajos: 1 semana, 15 días, 1 mes…).
2. Cuando algo **se acaba**, toca el botón de la tarjeta: pasa a **Falta comprar**.
3. Al **comprarlo**, un toque lo devuelve al inventario; si vence, la app pregunta hasta cuándo dura.
4. La pestaña **Falta** agrupa lo pendiente por comercio y se puede **compartir por WhatsApp**.
5. En **Inicio** ves lo que está **por vencer o vencido** antes de que se eche a perder.

Cada acción se puede **deshacer** desde el aviso que aparece abajo.

### Las cuatro pestañas

| Pestaña | Qué muestra |
|---|---|
| **Inicio** | Resumen del hogar, vencimientos próximos y lo que falta comprar. |
| **Inventario** | Todo, en galería con fotos o en lista compacta. Búsqueda y filtros por estado y categoría. |
| **Falta** | Lo marcado como «no hay», agrupado por comercio. |
| **Más** | Categorías, comercios, ajustes del hogar, datos y apariencia. |

### Categorías

El hogar arranca con **Alimentos, Bebidas, Medicina, Aseo del hogar, Aseo personal, Mascotas, Bebé,
Cocina y hogar, Otros**. Todas se pueden renombrar, cambiar de color e icono, o crear nuevas. Cada
categoría define si sus productos **manejan fecha de vencimiento** por defecto.

---

## 4. Cómo está hecho

```text
/
├── index.html              Marco de la aplicación
├── config.js               URL y clave del proyecto (opcional)
├── manifest.json           Metadatos PWA
├── service-worker.js       Precarga la app (no guarda datos)
├── supabase/schema.sql     Script de la base de datos
├── vendor/supabase.mjs     SDK oficial de Supabase, incluido en el proyecto
├── css/                    Sistema de diseño y adaptaciones por pantalla
└── js/
    ├── app.js              Arranque, marco, indicador de conexión
    ├── router.js           Rutas por hash (#/inventario)
    ├── state.js            Copia en memoria + actualización automática
    ├── api/                Conversación con la base de datos
    │   ├── client.js       Cliente, configuración y traducción de errores
    │   ├── auth.js         Sesión de la cuenta del hogar
    │   ├── household.js    Hogar y preferencias compartidas
    │   ├── products.js     Productos
    │   ├── catalog.js      Categorías y comercios
    │   └── photos.js       Compresión y subida de fotos
    ├── services/           Reglas (vencimientos, filtros, acciones, diagnóstico)
    ├── components/         Vistas, formularios y piezas de interfaz
    └── utils/              DOM, formato, fechas, iconos
```

Sin frameworks ni compilación: HTML, CSS y JavaScript con módulos nativos, más el SDK de Supabase
incluido en la carpeta `vendor/` (no se descarga nada de Internet en tiempo de ejecución).

### Tablas

| Tabla | Contenido |
|---|---|
| `households` | Un hogar por cuenta: nombre, días de aviso de vencimiento y moneda. |
| `categories` | Categorías del hogar, con color, icono y si sus productos vencen. |
| `stores` | Comercios donde se compra. |
| `products` | Nombre, categoría, comercio, presentación, **in_stock**, **expires_on**, precio de referencia, notas y ruta de la foto. |

Las fotos se guardan en el bucket `product-photos` del almacenamiento de Supabase.

### Seguridad

- **RLS activo** en las cuatro tablas: cada fila pertenece a un hogar y solo la ve la cuenta dueña.
- La sesión se guarda cifrada por el SDK en el navegador y se renueva sola.
- El bucket de fotos es de **lectura pública** con rutas imposibles de adivinar (UUID), y solo una
  sesión iniciada puede subir o borrar. Si prefieres privacidad total, cambia el bucket a privado en
  Supabase y usa URLs firmadas.

### Conexión

La app es **en línea**: pide los datos frescos al abrirse, al volver a ella y cada 45 segundos,
porque cualquier miembro del hogar pudo haberlos cambiado. El icono junto al título muestra el
estado (al día, actualizando, sin conexión o error) y sirve para actualizar al instante. Si se cae
la red, el cambio se revierte en pantalla y aparece un aviso claro.

---

## 5. Costos

El plan gratuito de Supabase incluye 500 MB de base de datos y 1 GB de almacenamiento: suficiente
para miles de productos con foto. Los proyectos gratuitos se pausan tras una semana **sin ninguna
actividad**; con el uso normal del hogar eso no ocurre, y se reactivan desde el panel.

## 6. Mantenimiento

Al agregar o quitar archivos estáticos, actualiza la lista de precarga y sube la versión:

```bash
node tools/update-precache.mjs   # regenera la lista del service worker
```

Luego cambia `VERSION` en `service-worker.js` y `APP_VERSION` en `js/app-info.js`. La app avisa a
cada dispositivo con «Hay una versión nueva disponible».

## 7. Traer datos de la versión anterior

Si usabas la versión que guardaba todo en el teléfono, exporta el respaldo desde aquella app y en la
nueva ve a **Más → Datos y privacidad → Importar**. Se crean los productos, categorías y comercios
que falten, respetando lo que ya tengas.
