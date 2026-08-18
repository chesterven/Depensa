/**
 * Iconos SVG en línea (trazo, 24x24). No dependen de Internet ni de fuentes externas.
 * Uso: icon('plus') -> cadena SVG | iconEl('plus') -> elemento SVG
 */

const PATHS = {
  home: '<path d="M4 10.6 12 4l8 6.6V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>',
  box: '<path d="M21 8.2 12 3.3 3 8.2v7.6l9 4.9 9-4.9z"/><path d="m3 8.2 9 4.9 9-4.9"/><path d="M12 13.1v7.6"/>',
  list: '<path d="M9.5 6.5h10"/><path d="M9.5 12h10"/><path d="M9.5 17.5h10"/><path d="m3.5 6.4 1.3 1.3 2.4-2.5"/><path d="m3.5 11.9 1.3 1.3 2.4-2.5"/><path d="m3.5 17.4 1.3 1.3 2.4-2.5"/>',
  receipt: '<path d="M5.5 3.2v17.6l2.2-1.4 2.1 1.4 2.2-1.4 2.1 1.4 2.2-1.4 2.2 1.4V3.2l-2.2 1.4-2.2-1.4-2.1 1.4-2.2-1.4-2.1 1.4z"/><path d="M9 9h6"/><path d="M9 13h6"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2.2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2.2"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20.5 20.5-4-4"/>',
  filter: '<path d="M3.5 6h17"/><path d="M6.5 12h11"/><path d="M10 18h4"/>',
  pencil: '<path d="M4 20.2h4.2L19.6 8.8a2.3 2.3 0 0 0-3.2-3.2L5 17z"/><path d="m15 7 2.9 2.9"/>',
  trash: '<path d="M4 7h16"/><path d="M9.5 7V5.3a1.3 1.3 0 0 1 1.3-1.3h2.4a1.3 1.3 0 0 1 1.3 1.3V7"/><path d="M6.3 7.4 7.2 19a2 2 0 0 0 2 1.9h5.6a2 2 0 0 0 2-1.9l.9-11.6"/><path d="M10.5 11v6"/><path d="M13.5 11v6"/>',
  close: '<path d="m6.3 6.3 11.4 11.4"/><path d="M17.7 6.3 6.3 17.7"/>',
  check: '<path d="m4.5 12.6 5 5L19.5 7"/>',
  checkCircle: '<circle cx="12" cy="12" r="8.6"/><path d="m8.2 12.4 2.6 2.6 5-5.2"/>',
  chevronRight: '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
  chevronLeft: '<path d="m14.5 5.5-6.5 6.5 6.5 6.5"/>',
  chevronDown: '<path d="m5.5 9 6.5 6.5L18.5 9"/>',
  arrowLeft: '<path d="M19 12H5"/><path d="m10.5 5.5-5.5 6.5 5.5 6.5"/>',
  store: '<path d="M4.5 10.2V20a1 1 0 0 0 1 1h13a1 1 0 0 0 1-1v-9.8"/><path d="M3 4.2h18l1.1 4.9a3 3 0 0 1-5.6 1.9 3 3 0 0 1-5.5.3 3 3 0 0 1-5.5-.3A3 3 0 0 1 1.9 9.1z"/><path d="M9.8 21v-5.6h4.4V21"/>',
  tag: '<path d="M20.4 13.5 13.5 20.4a2 2 0 0 1-2.8 0l-7.1-7.1V3.6h9.7l7.1 7.1a2 2 0 0 1 0 2.8z"/><circle cx="8.2" cy="8.2" r="1.4"/>',
  chart: '<path d="M4.5 20.5V11"/><path d="M10 20.5V4.5"/><path d="M15.5 20.5v-6.5"/><path d="M21 20.5V8.5"/><path d="M3 20.5h18"/>',
  calculator: '<rect x="4.5" y="2.8" width="15" height="18.4" rx="3"/><rect x="8" y="6.2" width="8" height="3.4" rx="1.2"/><path d="M8.6 13.5h.01"/><path d="M12 13.5h.01"/><path d="M15.4 13.5h.01"/><path d="M8.6 17.2h.01"/><path d="M12 17.2h.01"/><path d="M15.4 17.2h.01"/>',
  download: '<path d="M12 3.8v11.4"/><path d="m7.4 10.8 4.6 4.6 4.6-4.6"/><path d="M4.5 20.2h15"/>',
  upload: '<path d="M12 20.2V8.8"/><path d="m7.4 13.2 4.6-4.6 4.6 4.6"/><path d="M4.5 3.8h15"/>',
  share: '<path d="M12 3.2v13"/><path d="m7.8 7.4 4.2-4.2 4.2 4.2"/><path d="M5 12.5V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.5"/>',
  sliders: '<path d="M3.5 7.5h8"/><path d="M16.5 7.5h4"/><circle cx="14" cy="7.5" r="2.4"/><path d="M3.5 16.5h3"/><path d="M11.5 16.5h9"/><circle cx="9" cy="16.5" r="2.4"/>',
  moon: '<path d="M20 14.2A8.4 8.4 0 0 1 9.8 4 8.6 8.6 0 1 0 20 14.2z"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.6v2.2"/><path d="M12 19.2v2.2"/><path d="M2.6 12h2.2"/><path d="M19.2 12h2.2"/><path d="m5.4 5.4 1.6 1.6"/><path d="m17 17 1.6 1.6"/><path d="m18.6 5.4-1.6 1.6"/><path d="m7 17-1.6 1.6"/>',
  monitor: '<rect x="2.8" y="4" width="18.4" height="12.6" rx="2.4"/><path d="M8.5 20.4h7"/><path d="M12 16.6v3.8"/>',
  camera: '<path d="M4 8.4h2.9l1.6-2.3h7l1.6 2.3H20a1.2 1.2 0 0 1 1.2 1.2v8.6a1.2 1.2 0 0 1-1.2 1.2H4a1.2 1.2 0 0 1-1.2-1.2V9.6A1.2 1.2 0 0 1 4 8.4z"/><circle cx="12" cy="13.6" r="3.4"/>',
  image: '<rect x="3.2" y="4.4" width="17.6" height="15.2" rx="2.6"/><circle cx="8.6" cy="9.6" r="1.7"/><path d="m4.2 17.4 4.6-4.4 3.4 3 3-2.6 4.6 4"/>',
  alert: '<path d="M12 3.6 2.9 20.2h18.2z"/><path d="M12 10v4.2"/><path d="M12 17.3h.01"/>',
  info: '<circle cx="12" cy="12" r="8.8"/><path d="M12 11.2v5"/><path d="M12 7.8h.01"/>',
  shield: '<path d="M12 3.2 19 6v6.1c0 4.2-2.9 7.6-7 8.7-4.1-1.1-7-4.5-7-8.7V6z"/><path d="m9 12.2 2.1 2.1 4-4.2"/>',
  database: '<ellipse cx="12" cy="6" rx="7.5" ry="3.2"/><path d="M4.5 6v12c0 1.8 3.4 3.2 7.5 3.2s7.5-1.4 7.5-3.2V6"/><path d="M4.5 12c0 1.8 3.4 3.2 7.5 3.2s7.5-1.4 7.5-3.2"/>',
  sparkles: '<path d="M11.2 3.4 12.9 8.6 18 10.3l-5.1 1.7-1.7 5.2-1.7-5.2L4.4 10.3l5.1-1.7z"/><path d="m18 15.4.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z"/>',
  calendar: '<rect x="3.4" y="5" width="17.2" height="15.6" rx="2.6"/><path d="M3.4 9.8h17.2"/><path d="M8.2 3.4v3.2"/><path d="M15.8 3.4v3.2"/>',
  trendingUp: '<path d="m3.5 16.5 5.5-5.5 3.5 3.5 6-6.5"/><path d="M14.5 8h4v4"/>',
  trendingDown: '<path d="m3.5 8 5.5 5.5 3.5-3.5 6 6.5"/><path d="M14.5 16.5h4v-4"/>',
  cart: '<circle cx="9.5" cy="19.5" r="1.6"/><circle cx="17.5" cy="19.5" r="1.6"/><path d="M2.5 3.5h2.6l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h8.2a1.6 1.6 0 0 0 1.6-1.2L21 7.4H6"/>',
  refresh: '<path d="M20.4 11.4a8.4 8.4 0 1 0-.6 4.4"/><path d="M20.8 5.6v5.8h-5.8"/>',
  clock: '<circle cx="12" cy="12" r="8.8"/><path d="M12 6.8V12l3.4 2"/>',
  pin: '<path d="M12 21.4c4-4.4 6-7.7 6-10.2a6 6 0 1 0-12 0c0 2.5 2 5.8 6 10.2z"/><circle cx="12" cy="11" r="2.4"/>',
  copy: '<rect x="8.4" y="8.4" width="12" height="12" rx="2.6"/><path d="M15.6 5.6a2.6 2.6 0 0 0-2.6-2h-6a3 3 0 0 0-3 3v6a2.6 2.6 0 0 0 2 2.6"/>',
  eye: '<path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3.2"/>',
  star: '<path d="m12 3.6 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.8l5.9-.8z"/>',
  drop: '<path d="M12 3.2c3.6 4.2 6 7.2 6 10.1a6 6 0 0 1-12 0c0-2.9 2.4-5.9 6-10.1z"/>',
  wifiOff: '<path d="m2.5 2.5 19 19"/><path d="M6 10.6a12 12 0 0 1 3.4-2"/><path d="M2.6 7.3A17 17 0 0 1 7 4.6"/><path d="M14.6 8.4A12 12 0 0 1 18 10.6"/><path d="M17.2 4.7a17 17 0 0 1 4.2 2.6"/><path d="M9.4 14.4a6 6 0 0 1 5.2 0"/><path d="M12 19.5h.01"/>',
  bell: '<path d="M6.4 10.4a5.6 5.6 0 1 1 11.2 0c0 4.4 1.7 5.6 1.7 5.6H4.7s1.7-1.2 1.7-5.6z"/><path d="M10.2 19.2a2.2 2.2 0 0 0 3.6 0"/>',
  dots: '<circle cx="12" cy="5.5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="18.5" r="1.6"/>',
  scale: '<path d="M12 4.2v16"/><path d="M6.5 20.2h11"/><path d="M4 8.6h16"/><path d="M6.8 8.6 4 14.4a3 3 0 0 0 5.6 0z"/><path d="M17.2 8.6 14.4 14.4a3 3 0 0 0 5.6 0z"/>',
  jar: '<path d="M8 3.4h8v2.4a2 2 0 0 1-.6 1.4l-.4.4v1h-6v-1l-.4-.4A2 2 0 0 1 8 5.8z"/><path d="M7 9.6h10a1.6 1.6 0 0 1 1.6 1.6v8a1.6 1.6 0 0 1-1.6 1.6H7a1.6 1.6 0 0 1-1.6-1.6v-8A1.6 1.6 0 0 1 7 9.6z"/><path d="M9 13.6h6"/>',
};

export function icon(name, { size = 22, stroke = 1.8, className = '' } = {}) {
  const body = PATHS[name] || PATHS.info;
  return `<svg class="icon ${className}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

export function iconEl(name, opts) {
  const wrap = document.createElement('span');
  wrap.className = 'icon-wrap';
  wrap.innerHTML = icon(name, opts);
  return wrap.firstElementChild;
}

export function hasIcon(name) {
  return Object.prototype.hasOwnProperty.call(PATHS, name);
}

export const ICON_NAMES = Object.keys(PATHS);
