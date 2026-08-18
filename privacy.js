/** Información de privacidad. */
import { h } from '../../utils/dom.js';
import { icon } from '../../utils/icons.js';

export function render(ctx) {
  ctx.setHeader({ title: 'Privacidad', subtitle: 'Cómo se guardan tus datos', back: true });

  const points = [
    ['database', 'Todo se guarda en este dispositivo', 'Los productos, comercios y listas se almacenan en IndexedDB, dentro de tu navegador. Nada sale de aquí a menos que tú exportes el archivo.'],
    ['wifiOff', 'Funciona sin conexión', 'Después de la primera carga, la aplicación funciona completamente sin Internet.'],
    ['shield', 'Sin cuentas ni contraseñas', 'No hay registro, inicio de sesión ni identificadores de usuario.'],
    ['eye', 'Sin analítica ni publicidad', 'No se usan cookies de seguimiento, estadísticas externas ni anuncios.'],
    ['share', 'Tú controlas el archivo', 'Al compartir un respaldo, el archivo se envía por la aplicación que tú elijas (WhatsApp, correo, Drive…). La app nunca lo envía sola.'],
  ];

  return h('div',
    h('div.card',
      h('div.row', { style: { gap: '13px' } },
        h('div.thumb.thumb--lg.thumb--ok', { html: icon('shield', { size: 26 }) }),
        h('div.grow',
          h('h2', 'Todos tus datos se almacenan localmente en este dispositivo.'),
        ),
      ),
    ),
    ...points.map(([iconName, title, text]) => h('div.card.mt-2',
      h('div.row', { style: { gap: '12px', alignItems: 'flex-start' } },
        h('span.menu-item__icon', { html: icon(iconName, { size: 19 }) }),
        h('div.grow',
          h('div', { style: { fontWeight: 650, marginBottom: '3px' } }, title),
          h('div.muted.small', text),
        ),
      ),
    )),
    h('div.notice.mt-2',
      h('span', { html: icon('alert', { size: 18 }) }),
      h('span.grow', 'Como los datos viven solo aquí, exporta un respaldo con frecuencia: si borras los datos del navegador o desinstalas la app, se perderán.')),
    h('button.btn.btn-soft.btn-block.mt-2', { type: 'button', onclick: () => ctx.go('/respaldo') }, 'Ir a copia de seguridad'),
  );
}
