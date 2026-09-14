/**
 * Punto de entrada.
 * Decide qué mostrar (configuración, inicio de sesión o la app), arma el marco
 * y mantiene los datos al día contra la base de datos.
 */
import { h, $, setChildren } from './utils/dom.js';
import { icon } from './utils/icons.js';
import { formatRelative } from './utils/date.js';
import { initTheme } from './theme.js';
import {
  state, PHASE, subscribe, bootstrapSession, setSession, loadAll,
  startAutoRefresh, stopAutoRefresh,
} from './state.js';
import { onAuthChange } from './api/auth.js';
import { registerRoutes, initRouter, go, back, currentPath } from './router.js';
import { toast, toastOk, toastError } from './components/ui/toast.js';
import { openSheet, closeAllSheets } from './components/ui/sheet.js';
import { field, input } from './components/ui/form.js';
import { updatePassword } from './api/auth.js';
import { APP_VERSION } from './app-info.js';

import * as setupView from './components/views/setup.js';
import * as loginView from './components/views/login.js';
import * as dashboard from './components/views/dashboard.js';
import * as inventory from './components/views/inventory.js';
import * as productDetail from './components/views/product-detail.js';
import * as listView from './components/views/list.js';
import * as more from './components/views/more.js';
import * as categories from './components/views/categories.js';
import * as stores from './components/views/stores.js';
import * as settingsView from './components/views/settings.js';
import * as privacy from './components/views/privacy.js';

const NAV_ITEMS = [
  { path: '/', label: 'Inicio', iconName: 'home', key: 'home' },
  { path: '/inventario', label: 'Inventario', iconName: 'box', key: 'inventario' },
  { path: '/lista', label: 'Falta', iconName: 'cart', key: 'lista', badge: true },
  { path: '/mas', label: 'Más', iconName: 'grid', key: 'mas' },
];

const ROUTES = [
  { path: '/', view: dashboard.render, nav: 'home' },
  { path: '/inventario', view: inventory.render, nav: 'inventario' },
  { path: '/producto/:id', view: productDetail.render, nav: 'inventario' },
  { path: '/lista', view: listView.render, nav: 'lista' },
  { path: '/mas', view: more.render, nav: 'mas' },
  { path: '/categorias', view: categories.render, nav: 'mas' },
  { path: '/comercios', view: stores.render, nav: 'mas' },
  { path: '/ajustes', view: settingsView.render, nav: 'mas' },
  { path: '/privacidad', view: privacy.render, nav: 'mas' },
];

let headerEl = null;
let navEl = null;
let connectionEl = null;
let shellReady = false;
let routerReady = false;

/* ---------- Pantallas completas (configuración / sesión / carga) ---------- */
function renderFullscreen(node) {
  shellReady = false;
  routerReady = false;
  stopAutoRefresh();
  closeAllSheets();
  setChildren($('#app'), node);
  $('#loading')?.remove();
}

function loadingScreen(message = 'Cargando tu despensa…') {
  return h('div.auth-screen.auth-screen--center',
    h('div.loading-screen__inner',
      h('img', { src: './assets/icons/icon-192.png', alt: '', width: 64, height: 64, style: { borderRadius: '20px' } }),
      h('span.loader'),
      h('span.muted.small', message)));
}

function errorScreen(message, { onRetry, onReconnect, onSignOut }) {
  return h('div.auth-screen',
    h('div.card',
      h('div.empty',
        h('div.empty__icon', { style: { color: 'var(--danger)' }, html: icon('alert', { size: 28 }) }),
        h('div.empty__title', 'No se pudo cargar la despensa'),
        h('div.empty__text', message),
        h('button.btn.btn-primary', { type: 'button', onclick: onRetry },
          h('span', { html: icon('refresh', { size: 18 }) }), 'Reintentar'),
      ),
      h('div.menu-list.mt-2',
        h('button.menu-item', { type: 'button', onclick: onReconnect },
          h('span.menu-item__icon', { html: icon('database', { size: 18 }) }),
          h('div.menu-item__body',
            h('div.menu-item__title', 'Revisar la conexión'),
            h('div.menu-item__hint', 'URL, clave y tablas de la base de datos'))),
        h('button.menu-item', { type: 'button', onclick: onSignOut },
          h('span.menu-item__icon', { html: icon('arrowLeft', { size: 18 }) }),
          h('div.menu-item__body', h('div.menu-item__title', 'Cerrar sesión'))),
      ),
    ));
}

/* ---------- Marco de la app ---------- */
function buildShell() {
  const app = $('#app');
  app.replaceChildren();

  headerEl = h('header.app-header', h('div.app-header__row'));
  const main = h('main.app-main', { id: 'view', tabindex: '-1' });
  navEl = h('nav.bottom-nav', { 'aria-label': 'Navegación principal' }, h('div.bottom-nav__inner'));

  app.append(headerEl, main, navEl);
  renderNav('home');

  const onScroll = () => headerEl.classList.toggle('is-stuck', window.scrollY > 6);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  shellReady = true;
  return main;
}

function renderHeader(meta = {}, route = null) {
  if (!headerEl) return;
  const row = headerEl.querySelector('.app-header__row');
  connectionEl = h('button.conn', {
    type: 'button',
    onclick: () => loadAll({ silent: true }),
    'aria-label': 'Estado de la conexión. Tocar para actualizar',
  });
  paintConnection();

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
    h('div.app-header__actions',
      connectionEl,
      ...(meta.actions || []).map((action) => h('button.btn-icon', {
        type: 'button',
        'aria-label': action.label,
        title: action.label,
        html: icon(action.iconName, { size: 21 }),
        onclick: action.onClick,
      })),
    ),
  );
}

function paintConnection() {
  if (!connectionEl) return;
  let name = 'checkCircle';
  let cls = 'is-ok';
  let label = state.lastSyncAt ? `Al día · ${formatRelative(state.lastSyncAt)}` : 'Al día';

  if (state.refreshing || state.loading) {
    name = 'refresh'; cls = 'is-busy'; label = 'Actualizando…';
  } else if (!state.online) {
    name = 'wifiOff'; cls = 'is-off'; label = 'Sin conexión';
  } else if (state.error) {
    name = 'alert'; cls = 'is-bad'; label = 'Error al sincronizar';
  }

  connectionEl.className = `conn ${cls}`;
  connectionEl.title = label;
  connectionEl.setAttribute('aria-label', `${label}. Tocar para actualizar`);
  connectionEl.innerHTML = icon(name, { size: 18 });
}

function renderNav(activeKey) {
  if (!navEl) return;
  const inner = navEl.querySelector('.bottom-nav__inner');
  const missing = state.products.filter((product) => !product.inStock).length;
  setChildren(inner, ...NAV_ITEMS.map((item) => {
    const active = item.key === activeKey;
    return h('a', {
      class: `nav-item${active ? ' is-active' : ''}`,
      href: `#${item.path}`,
      'aria-current': active ? 'page' : null,
    },
    h('span', { html: icon(item.iconName, { size: 22, stroke: active ? 2.1 : 1.8 }) }),
    h('span', item.label),
    item.badge && missing ? h('span.nav-item__badge', { 'aria-label': `${missing} pendientes` }, String(Math.min(99, missing))) : null);
  }));
}

/* ---------- Service worker ---------- */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
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

/* ---------- Fases ---------- */
async function showPhase() {
  switch (state.phase) {
    case PHASE.SETUP:
      renderFullscreen(setupView.render({
        onDone: async () => { await bootstrapSession(); showPhase(); },
      }));
      return;

    case PHASE.LOGIN:
      renderFullscreen(loginView.render({
        onDone: async () => { await bootstrapSession(); showPhase(); },
        onReconfigure: async () => { await bootstrapSession(); showPhase(); },
      }));
      return;

    case PHASE.READY:
      await startApp();
      return;

    default:
      renderFullscreen(loadingScreen());
  }
}

async function startApp() {
  if (!state.household) {
    renderFullscreen(loadingScreen());
    const ok = await loadAll();
    if (!ok) {
      renderFullscreen(errorScreen(state.error || 'Revisa tu conexión.', {
        onRetry: () => showPhase(),
        onReconnect: () => { state.phase = PHASE.SETUP; showPhase(); },
        onSignOut: async () => {
          const { signOut } = await import('./api/auth.js');
          try { await signOut(); } catch (_) { /* ignorado */ }
          setSession(null);
          showPhase();
        },
      }));
      return;
    }
  }

  if (!shellReady) buildShell();
  if (!routerReady) {
    registerRoutes(ROUTES);
    initRouter({
      outletEl: $('#view'),
      header: renderHeader,
      onNavigate: (route) => renderNav(route.nav),
    });
    routerReady = true;
  }
  startAutoRefresh();
  $('#loading')?.remove();
  document.body.dataset.ready = 'true';
}

/* ---------- Recuperación de contraseña ---------- */
function askNewPassword() {
  const passwordInput = input({ type: 'password', autocomplete: 'new-password', placeholder: 'Nueva contraseña' });
  openSheet({
    title: 'Elige una contraseña nueva',
    subtitle: 'Recuerda compartirla con tu familia',
    dismissible: false,
    content: h('div', field('Nueva contraseña', passwordInput, { hint: 'Mínimo 6 caracteres.' })),
    actions: [{
      label: 'Guardar',
      variant: 'btn-primary',
      keepOpen: true,
      onClick: async (api) => {
        if (passwordInput.value.length < 6) { toastError('Usa al menos 6 caracteres.'); return false; }
        try {
          await updatePassword(passwordInput.value);
          toastOk('Contraseña actualizada');
          api.close();
        } catch (error) { toastError(error); return false; }
        return true;
      },
    }],
  });
}

/* ---------- Arranque ---------- */
async function bootstrap() {
  initTheme();
  registerServiceWorker();
  renderFullscreen(loadingScreen('Conectando…'));

  await bootstrapSession();
  await showPhase();

  // La interfaz reacciona a los cambios de estado
  subscribe((_, reason) => {
    paintConnection();
    if (shellReady && ['products', 'loaded', 'session'].includes(reason)) {
      const route = ROUTES.find((r) => matchesPath(r.path, currentPath()));
      renderNav(route?.nav || 'home');
    }
  });

  // Cambios de sesión (entrar, salir, recuperar contraseña)
  try {
    onAuthChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') { askNewPassword(); return; }
      if (event === 'SIGNED_OUT') {
        setSession(null);
        await showPhase();
        return;
      }
      if (event === 'SIGNED_IN' && state.phase !== PHASE.READY) {
        setSession(session);
        await showPhase();
      }
    });
  } catch (_) { /* todavía sin configurar */ }

  console.info(`Despensa ${APP_VERSION}`);
}

function matchesPath(pattern, path) {
  const regex = new RegExp('^' + pattern.replace(/:[^/]+/g, '[^/]+') + '/?$');
  return regex.test(path);
}

bootstrap();

export { go };
