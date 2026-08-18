/**
 * Punto de entrada: arma la interfaz, carga los datos y arranca el enrutador.
 * Toda la lógica se ejecuta en el navegador; no hay servidor ni API.
 */
import { h, $, setChildren } from './utils/dom.js';
import { icon } from './utils/icons.js';
import { initTheme } from './theme.js';
import { state, loadAll, subscribe, pendingItems } from './state.js';
import { saveAppSettings } from './database/settings.js';
import { requestPersistence } from './database/database.js';
import { registerRoutes, initRouter, go, back, currentPath } from './router.js';
import { toast, toastOk, toastError } from './components/ui/toast.js';
import { openSheet } from './components/ui/sheet.js';
import { loadDemoData } from './services/demo-data.js';
import { APP_VERSION } from './app-info.js';

import * as dashboard from './components/views/dashboard.js';
import * as inventory from './components/views/inventory.js';
import * as productDetail from './components/views/product-detail.js';
import * as shoppingList from './components/views/shopping-list.js';
import * as purchases from './components/views/purchases.js';
import * as more from './components/views/more.js';
import * as stores from './components/views/stores.js';
import * as categories from './components/views/categories.js';
import * as budget from './components/views/budget.js';
import * as stats from './components/views/stats.js';
import * as backup from './components/views/backup.js';
import * as settingsView from './components/views/settings.js';
import * as privacy from './components/views/privacy.js';

const NAV_ITEMS = [
  { path: '/', label: 'Inicio', iconName: 'home', key: 'home' },
  { path: '/inventario', label: 'Inventario', iconName: 'box', key: 'inventario' },
  { path: '/lista', label: 'Lista', iconName: 'list', key: 'lista', badge: true },
  { path: '/compras', label: 'Compras', iconName: 'receipt', key: 'compras' },
  { path: '/mas', label: 'Más', iconName: 'grid', key: 'mas' },
];

const ROUTES = [
  { path: '/', view: dashboard.render, nav: 'home' },
  { path: '/inventario', view: inventory.render, nav: 'inventario' },
  { path: '/producto/:id', view: productDetail.render, nav: 'inventario' },
  { path: '/lista', view: shoppingList.render, nav: 'lista' },
  { path: '/compras', view: purchases.render, nav: 'compras' },
  { path: '/mas', view: more.render, nav: 'mas' },
  { path: '/comercios', view: stores.render, nav: 'mas' },
  { path: '/categorias', view: categories.render, nav: 'mas' },
  { path: '/presupuesto', view: budget.render, nav: 'mas' },
  { path: '/estadisticas', view: stats.render, nav: 'mas' },
  { path: '/respaldo', view: backup.render, nav: 'mas' },
  { path: '/ajustes', view: settingsView.render, nav: 'mas' },
  { path: '/privacidad', view: privacy.render, nav: 'mas' },
];

let headerEl = null;
let navEl = null;

function buildShell() {
  const app = $('#app');
  app.replaceChildren();

  headerEl = h('header.app-header', h('div.app-header__row'));
  const main = h('main.app-main', { id: 'view', tabindex: '-1' });
  navEl = h('nav.bottom-nav', { 'aria-label': 'Navegación principal' }, h('div.bottom-nav__inner'));

  app.append(headerEl, main, navEl);
  renderNav('/');

  // Sombra del encabezado al desplazarse
  const onScroll = () => headerEl.classList.toggle('is-stuck', window.scrollY > 6);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  return main;
}

function renderHeader(meta = {}, route = null) {
  const row = headerEl.querySelector('.app-header__row');
  setChildren(row,
    meta.back ? h('button.btn-icon.btn-ghost', {
      type: 'button',
      'aria-label': 'Volver',
      html: icon('arrowLeft', { size: 22 }),
      onclick: () => back(route?.nav === 'mas' ? '/mas' : '/'),
    }) : null,
    h('div.app-header__titles',
      h('h1.app-header__title.truncate', meta.title || 'Despensa'),
      meta.subtitle ? h('div.app-header__subtitle.truncate', meta.subtitle) : null,
    ),
    h('div.app-header__actions', ...(meta.actions || []).map((action) => h('button.btn-icon', {
      type: 'button',
      'aria-label': action.label,
      title: action.label,
      html: icon(action.iconName, { size: 21 }),
      onclick: action.onClick,
    }))),
  );
}

function renderNav(activeKey) {
  const inner = navEl.querySelector('.bottom-nav__inner');
  const pending = pendingItems().length;
  setChildren(inner, ...NAV_ITEMS.map((item) => {
    const active = item.key === activeKey;
    return h('a', {
      class: `nav-item${active ? ' is-active' : ''}`,
      href: `#${item.path}`,
      'aria-current': active ? 'page' : null,
    },
    h('span', { html: icon(item.iconName, { size: 22, stroke: active ? 2.1 : 1.8 }) }),
    h('span', item.label),
    item.badge && pending ? h('span.nav-item__badge', { 'aria-label': `${pending} pendientes` }, String(Math.min(99, pending))) : null,
    );
  }));
}

/* ---------- Service worker ---------- */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return; // requiere http(s)
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Hay una versión nueva disponible.', {
              type: 'info',
              duration: 12000,
              action: {
                label: 'Actualizar',
                onClick: () => {
                  installing.postMessage({ type: 'SKIP_WAITING' });
                  setTimeout(() => window.location.reload(), 300);
                },
              },
            });
          }
        });
      });
    } catch (error) {
      console.warn('[sw] no se pudo registrar', error);
    }
  });
}

/* ---------- Conexión ---------- */
function watchConnection() {
  window.addEventListener('offline', () => toast('Sin conexión: la app sigue funcionando con tus datos locales.', { type: 'warn' }));
  window.addEventListener('online', () => toast('Conexión restablecida.', { type: 'ok', duration: 1800 }));
}

/* ---------- Primera ejecución ---------- */
function showWelcome() {
  openSheet({
    title: 'Bienvenido a Despensa',
    subtitle: 'Control de productos del hogar',
    dismissible: false,
    content: h('div',
      h('p', 'Registra lo que tienes en casa, marca lo que se agota y lleva el control de precios y comercios.'),
      h('div.notice.notice--ok',
        h('span', { html: icon('shield', { size: 18 }) }),
        h('span.grow', 'Todos tus datos se almacenan localmente en este dispositivo. No se envía nada a ningún servidor.')),
      h('div.notice.notice--info.mt-2',
        h('span', { html: icon('share', { size: 18 }) }),
        h('span.grow', 'Para compartir el inventario con tu familia, exporta el archivo JSON desde «Más → Copia de seguridad».')),
    ),
    actions: [
      {
        label: 'Empezar de cero',
        variant: 'btn-soft',
        onClick: async () => { await saveAppSettings({ onboarded: true }); },
      },
      {
        label: 'Cargar ejemplo',
        variant: 'btn-primary',
        onClick: async () => {
          try {
            await loadDemoData();
            await saveAppSettings({ onboarded: true });
            toastOk('Datos de demostración cargados');
          } catch (error) {
            toastError(error);
          }
        },
      },
    ],
  });
}

/* ---------- Arranque ---------- */
async function bootstrap() {
  initTheme();
  registerServiceWorker();
  watchConnection();

  try {
    await loadAll();
  } catch (error) {
    console.error(error);
    $('#app').replaceChildren(h('div.app-main',
      h('div.notice', h('span', { html: icon('alert', { size: 18 }) }),
        h('span.grow', 'No se pudo abrir la base de datos local. Revisa que el navegador permita el almacenamiento (evita el modo privado).')),
    ));
    $('#loading')?.remove();
    return;
  }

  const outletEl = buildShell();
  registerRoutes(ROUTES);
  initRouter({
    outletEl,
    header: renderHeader,
    onNavigate: (route) => renderNav(route.nav),
  });

  subscribe(() => {
    const route = ROUTES.find((r) => matchesPath(r.path, currentPath()));
    renderNav(route?.nav || 'home');
  });

  $('#loading')?.remove();
  document.body.dataset.ready = 'true';

  if (!state.settings?.onboarded) showWelcome();
  requestPersistence().catch(() => {});
  console.info(`Despensa ${APP_VERSION} lista.`);
}

function matchesPath(pattern, path) {
  const regex = new RegExp('^' + pattern.replace(/:[^/]+/g, '[^/]+') + '/?$');
  return regex.test(path);
}

bootstrap();

export { go };
