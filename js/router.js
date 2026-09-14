/**
 * Enrutador basado en hash (#/ruta).
 * Funciona sin servidor especial y sobrevive a recargas offline.
 */
import { subscribe } from './state.js';
import { closeAllSheets } from './components/ui/sheet.js';

const routes = [];
let outlet = null;
let current = null;
let onChange = null;

/** @param {Array<{path:string, view:Function, nav?:string}>} list */
export function registerRoutes(list) {
  routes.length = 0;
  list.forEach((route) => {
    const keys = [];
    const pattern = new RegExp('^' + route.path.replace(/:[^/]+/g, (match) => {
      keys.push(match.slice(1));
      return '([^/]+)';
    }) + '/?$');
    routes.push({ ...route, pattern, keys });
  });
}

export function currentPath() {
  const hash = window.location.hash || '#/';
  return hash.replace(/^#/, '').split('?')[0] || '/';
}

export function currentQuery() {
  const hash = window.location.hash || '';
  const index = hash.indexOf('?');
  return index === -1 ? {} : Object.fromEntries(new URLSearchParams(hash.slice(index + 1)));
}

export function go(path, { replace = false } = {}) {
  const target = path.startsWith('#') ? path : `#${path}`;
  if (replace) window.location.replace(target);
  else window.location.hash = target;
}

export function back(fallback = '/') {
  if (window.history.length > 1) window.history.back();
  else go(fallback, { replace: true });
}

function match(path) {
  for (const route of routes) {
    const result = route.pattern.exec(path);
    if (!result) continue;
    const params = {};
    route.keys.forEach((key, index) => { params[key] = decodeURIComponent(result[index + 1]); });
    return { route, params };
  }
  return null;
}

/** Contexto que reciben las vistas. */
function createContext(route, params, header) {
  const cleanups = [];
  const ctx = {
    params,
    query: currentQuery(),
    route,
    go,
    back,
    setHeader: header,
    onCleanup(fn) { cleanups.push(fn); },
    onState(fn) { cleanups.push(subscribe(fn)); },
    /** Vuelve a dibujar la vista conservando desplazamiento y foco. */
    refresh() { scheduleRefresh(); },
    destroy() { cleanups.forEach((fn) => { try { fn(); } catch (_) { /* ignorado */ } }); },
  };
  return ctx;
}

let headerSetter = () => {};
let renderToken = 0;
let lastPath = null;
let refreshScheduled = false;

/** Agrupa varias peticiones de redibujado en un solo fotograma. */
function scheduleRefresh() {
  if (refreshScheduled) return;
  refreshScheduled = true;
  requestAnimationFrame(() => {
    refreshScheduled = false;
    render(true);
  });
}

async function render(keepScroll = false) {
  const path = currentPath();
  const found = match(path) || match('/');
  if (!found) return;

  const token = ++renderToken;
  const scrollY = keepScroll ? window.scrollY : 0;
  const focusKey = keepScroll ? document.activeElement?.dataset?.keepFocus : null;
  const selection = focusKey ? {
    start: document.activeElement.selectionStart,
    end: document.activeElement.selectionEnd,
  } : null;

  if (current) {
    current.ctx.destroy();
    current = null;
  }
  // Solo se cierran los diálogos cuando realmente se cambia de pantalla
  if (!keepScroll && lastPath !== null && lastPath !== path) closeAllSheets();
  lastPath = path;

  const ctx = createContext(found.route, found.params, (meta) => headerSetter(meta, found.route));
  let node;
  try {
    node = await found.route.view(ctx);
  } catch (error) {
    console.error('[router] error al dibujar la vista', error);
    node = document.createElement('div');
    node.className = 'notice';
    node.textContent = 'No se pudo mostrar esta sección.';
  }
  if (token !== renderToken) return; // otra navegación tomó el control

  outlet.replaceChildren(node);
  // La animación de entrada se quita al terminar: mientras está aplicada crea un
  // bloque contenedor que descolocaría los elementos fijos (botón flotante).
  node.classList?.add('view-enter');
  const clearAnimation = () => node.classList?.remove('view-enter');
  node.addEventListener?.('animationend', clearAnimation, { once: true });
  setTimeout(clearAnimation, 600);
  current = { ctx, route: found.route };
  onChange?.(found.route, found.params);

  if (keepScroll) {
    window.scrollTo({ top: scrollY });
    if (focusKey) {
      const target = outlet.querySelector(`[data-keep-focus="${focusKey}"]`);
      if (target) {
        target.focus({ preventScroll: true });
        try { target.setSelectionRange(selection.start, selection.end); } catch (_) { /* no aplica */ }
      }
    }
  } else {
    window.scrollTo({ top: 0 });
  }
}

export function initRouter({ outletEl, header, onNavigate }) {
  outlet = outletEl;
  headerSetter = header;
  onChange = onNavigate;
  window.addEventListener('hashchange', () => render(false));
  if (!window.location.hash) {
    // replaceState no dispara hashchange (evita un doble dibujado al iniciar)
    try { window.history.replaceState(null, '', '#/'); } catch (_) { window.location.hash = '#/'; }
  }
  render(false);
}

export function refreshCurrentView() {
  if (current) render(true);
}
