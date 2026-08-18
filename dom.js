/**
 * Ayudantes mínimos de DOM (sin framework).
 * h() crea elementos de forma declarativa y escapa el contenido de texto por diseño.
 */

/**
 * @param {string} tag  'div', 'button.primary', 'span#id.clase'
 * @param {object} [props] atributos, eventos (onclick, oninput...), dataset, style
 * @param  {...any} children nodos, cadenas, arreglos o null
 */
export function h(tag, props, ...children) {
  let tagName = 'div';
  const classes = [];
  let id = null;
  const m = String(tag).match(/^([a-zA-Z0-9-]+)?((?:[.#][^.#]+)*)$/);
  if (m) {
    tagName = m[1] || 'div';
    const rest = m[2] || '';
    rest.split(/(?=[.#])/).forEach((token) => {
      if (!token) return;
      if (token[0] === '.') classes.push(token.slice(1));
      else if (token[0] === '#') id = token.slice(1);
    });
  }
  const el = document.createElement(tagName);
  if (classes.length) el.className = classes.join(' ');
  if (id) el.id = id;

  if (props && typeof props === 'object' && !(props instanceof Node) && !Array.isArray(props)) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'class' || key === 'className') {
        el.className = [el.className, value].filter(Boolean).join(' ');
      } else if (key === 'style' && typeof value === 'object') {
        Object.assign(el.style, value);
      } else if (key === 'dataset' && typeof value === 'object') {
        Object.assign(el.dataset, value);
      } else if (key === 'html') {
        el.innerHTML = value;
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === 'value' || key === 'checked' || key === 'disabled' || key === 'selected') {
        el[key] = value;
      } else {
        el.setAttribute(key, value === true ? '' : value);
      }
    }
  } else if (props != null) {
    children.unshift(props);
  }

  append(el, children);
  return el;
}

export function append(parent, children) {
  for (const child of children.flat(4)) {
    if (child == null || child === false || child === true) continue;
    parent.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return parent;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Reemplaza los hijos de un nodo ignorando valores nulos. */
export function setChildren(parent, ...children) {
  parent.replaceChildren();
  append(parent, children);
  return parent;
}

export function clear(node) {
  while (node && node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** Escapa texto para las pocas plantillas que usan innerHTML. */
export function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);
}

/** Retrasa la ejecución (búsqueda mientras se escribe). */
export function debounce(fn, wait = 220) {
  let timer = null;
  return function debounced(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), wait);
  };
}

/** Vibración corta en dispositivos compatibles (nunca falla si no existe). */
export function haptic(pattern = 8) {
  try { navigator.vibrate?.(pattern); } catch (_) { /* silencioso */ }
}

/** Aplica una animación de entrada escalonada a los hijos de un contenedor. */
export function stagger(container, step = 28, max = 12) {
  Array.from(container.children).slice(0, max).forEach((child, i) => {
    child.style.setProperty('--stagger', `${i * step}ms`);
    child.classList.add('animate-in');
  });
  return container;
}

/** Desplaza un elemento a la vista dentro de la app sin saltos bruscos. */
export function scrollIntoViewSoft(el) {
  try { el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (_) { el.scrollIntoView(); }
}
