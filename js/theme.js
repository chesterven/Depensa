/** Tema claro / oscuro / automático (preferencia guardada en localStorage). */
import { getPref, setPref } from './utils/prefs.js';

export const THEMES = [
  { value: 'auto', label: 'Automático', icon: 'monitor' },
  { value: 'light', label: 'Claro', icon: 'sun' },
  { value: 'dark', label: 'Oscuro', icon: 'moon' },
];

const COLORS = { light: '#f6f2ea', dark: '#101310' };
let media = null;

export function getTheme() {
  return getPref('theme', 'auto');
}

export function resolveTheme(theme = getTheme()) {
  if (theme === 'auto') {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme = getTheme()) {
  const resolved = resolveTheme(theme);
  document.documentElement.setAttribute('data-theme', resolved);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', COLORS[resolved]);
  return resolved;
}

export function setTheme(theme) {
  setPref('theme', theme);
  return applyTheme(theme);
}

export function initTheme() {
  applyTheme();
  try {
    media = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = () => { if (getTheme() === 'auto') applyTheme('auto'); };
    media.addEventListener ? media.addEventListener('change', listener) : media.addListener(listener);
  } catch (_) { /* navegador sin matchMedia */ }
}
