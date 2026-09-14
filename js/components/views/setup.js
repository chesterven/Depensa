/** Pantalla de conexión con la base de datos (primer arranque). */
import { h } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';
import { getConfig, saveConfig, validateConfig, resetClient } from '../../api/client.js';
import { runDiagnostics } from '../../services/diagnostics.js';
import { field, input, setFieldError } from '../ui/form.js';
import { toastOk, toastError } from '../ui/toast.js';
import { openSheet } from '../ui/sheet.js';

export function render({ onDone }) {
  const current = getConfig();
  const root = h('div.auth-screen');

  const urlInput = input({
    name: 'url',
    value: current.url,
    placeholder: 'https://abcdefgh.supabase.co',
    autocomplete: 'off',
    autocapitalize: 'none',
    spellcheck: 'false',
    inputmode: 'url',
  });
  const keyInput = h('textarea.textarea', {
    name: 'anonKey',
    rows: 3,
    placeholder: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9…',
    autocapitalize: 'none',
    spellcheck: 'false',
    style: { fontFamily: 'ui-monospace, monospace', fontSize: '13px' },
  });
  keyInput.value = current.anonKey;

  const results = h('div.mt-2');

  const form = h('form.stack', { onsubmit: (event) => { event.preventDefault(); connect(); } },
    field('URL del proyecto', urlInput, { hint: 'Supabase → Settings → API → Project URL' }),
    field('Clave pública (anon public)', keyInput, { hint: 'Supabase → Settings → API → Project API keys' }),
    h('button.btn.btn-primary.btn-block', { type: 'submit' },
      h('span', { html: icon('database', { size: 18 }) }), 'Probar conexión y continuar'),
    results,
  );

  root.append(
    h('div.auth-brand',
      h('img', { src: './assets/icons/icon-192.png', alt: '', width: 64, height: 64 }),
      h('h1', 'Despensa'),
      h('p.muted', 'Conecta la aplicación con la base de datos de tu hogar.'),
    ),
    h('div.card',
      h('div.card-head', h('h3', 'Antes de empezar')),
      h('ol.steps',
        h('li', 'Crea un proyecto gratuito en ', h('a', { href: 'https://supabase.com', target: '_blank', rel: 'noopener' }, 'supabase.com'), '.'),
        h('li', 'Abre el ', h('strong', 'SQL Editor'), ' y ejecuta el archivo ', h('code', 'supabase/schema.sql'), ' que viene con la app.'),
        h('li', 'Copia la ', h('strong', 'URL'), ' y la ', h('strong', 'clave anon public'), ' desde Settings → API y pégalas aquí.'),
      ),
      h('button.btn.btn-soft.btn-sm.btn-block.mt-1', { type: 'button', onclick: showSql },
        h('span', { html: icon('copy', { size: 16 }) }), 'Ver el script SQL'),
    ),
    h('div.card.mt-2', form),
    h('p.muted.small.text-center.mt-2',
      'La clave anon está hecha para usarse en el navegador: el acceso real lo controlan las políticas de seguridad de la base de datos.'),
  );

  return root;

  async function connect() {
    const checked = validateConfig({ url: urlInput.value, anonKey: keyInput.value });
    setFieldError(urlInput, checked.errors.url || null);
    setFieldError(keyInput, checked.errors.anonKey || null);
    if (!checked.valid) return;

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    results.replaceChildren(h('div.row', { style: { gap: '10px', padding: '12px 0' } },
      h('span.loader'), h('span.small.muted', 'Comprobando la conexión…')));

    try {
      saveConfig({ url: checked.url, anonKey: checked.anonKey });
      resetClient();
      const report = await runDiagnostics();
      results.replaceChildren(
        ...report.steps.map((step) => h('div.check-row',
          h('span', { class: `check-dot ${step.ok ? 'is-ok' : 'is-bad'}`, html: icon(step.ok ? 'check' : 'close', { size: 14 }) }),
          h('div.grow',
            h('div', { style: { fontWeight: 600 } }, step.label),
            h('div.muted.small', step.detail)),
        )),
      );
      if (report.ok) {
        toastOk('Conexión lista');
        setTimeout(() => onDone(), 600);
      } else {
        toastError('Revisa los puntos marcados en rojo.');
      }
    } catch (error) {
      toastError(error);
      results.replaceChildren();
    } finally {
      button.disabled = false;
    }
  }

  async function showSql() {
    let sql = '';
    try {
      const response = await fetch('./supabase/schema.sql');
      sql = await response.text();
    } catch (_) {
      sql = 'No se pudo leer el archivo. Ábrelo desde la carpeta del proyecto: supabase/schema.sql';
    }
    openSheet({
      title: 'Script SQL',
      subtitle: 'Pégalo completo en el SQL Editor de Supabase',
      content: h('pre.code-block', sql),
      actions: [
        { label: 'Cerrar', variant: 'btn-soft', onClick: () => {} },
        {
          label: 'Copiar',
          variant: 'btn-primary',
          onClick: async () => {
            try {
              await navigator.clipboard.writeText(sql);
              toastOk('Script copiado');
            } catch (_) {
              toastError('Tu navegador no permitió copiar. Selecciona el texto manualmente.');
            }
          },
        },
      ],
    });
  }
}
