/** Gráficas ligeras hechas con DOM y SVG (sin librerías externas). */
import { h } from '../../utils/dom.js';
import { money } from '../../utils/format.js';

/**
 * Gráfica de barras verticales.
 * @param {Array<{key:string,label:string,value:number}>} data
 */
export function barChart(data, { format = money, highlightLast = true, height = 150 } = {}) {
  const values = data.map((d) => Number(d.value) || 0);
  const max = Math.max(...values, 0) || 1;
  const showValues = data.length <= 8;
  const wrap = h('div.chart-bars', {
    style: { height: `${height}px` },
    role: 'img',
    'aria-label': describe(data, format),
  });

  data.forEach((item, index) => {
    const isLast = highlightLast && index === data.length - 1;
    const value = Number(item.value) || 0;
    const pct = value > 0 ? Math.max(3, Math.round((value / max) * 100)) : 0;
    wrap.appendChild(h('div', {
      class: `chart-bar${isLast ? ' is-current' : ''}`,
      title: `${item.label}: ${format(value)}`,
    },
    h('div.chart-bar__track',
      h('span.chart-bar__fill', { style: { height: `${pct}%` } }),
      isLast && value > 0 ? h('span.chart-bar__flag', { style: { bottom: `${pct}%` } }, format(value)) : null,
    ),
    showValues && value > 0 ? h('span.chart-tip', format(value)) : null,
    h('span.chart-bar__label', item.label),
    ));
  });

  const top = data.reduce((best, item) => ((Number(item.value) || 0) > (Number(best?.value) || 0) ? item : best), data[0]);
  const average = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

  return h('div',
    wrap,
    h('div.row.row--between.small.muted', { style: { marginTop: '10px' } },
      h('span', `Promedio ${format(Math.round(average * 100) / 100)}`),
      top ? h('span', `Máximo ${format(top.value)} · ${top.label}`) : null,
    ),
  );
}

function describe(data, format) {
  return data.map((d) => `${d.label}: ${format(d.value)}`).join(', ');
}

/**
 * Lista de barras horizontales (gasto por categoría / comercio).
 * @param {Array<{name:string,value:number,count?:number,color?:string}>} rows
 */
export function barList(rows, { format = money, max = null, showCount = true } = {}) {
  const top = max ?? Math.max(...rows.map((r) => r.value), 0) ?? 1;
  const wrap = h('div.bar-list');
  rows.forEach((row) => {
    const pct = top > 0 ? Math.max(2, Math.round((row.value / top) * 100)) : 0;
    wrap.appendChild(h('div.bar-row',
      h('div.bar-row__head',
        h('span.truncate', row.name),
        h('span.bar-row__value', format(row.value), showCount && row.count != null
          ? h('span.muted.small', ` · ${row.count}`) : null),
      ),
      h('div.bar-track', h('div.bar-fill', {
        style: { width: `${pct}%`, background: row.color || 'var(--pine)' },
      })),
    ));
  });
  return wrap;
}

/**
 * Línea de evolución de precios.
 * @param {Array<{date:string,value:number,label?:string}>} points
 */
export function sparkline(points, { format = money } = {}) {
  const values = points.map((p) => Number(p.value) || 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.max(max * 0.2, 1);
  const W = 320;
  const H = 78;
  const pad = 8;
  const stepX = points.length > 1 ? (W - pad * 2) / (points.length - 1) : 0;
  const toY = (value) => H - pad - ((value - min + span * 0.12) / (span * 1.24)) * (H - pad * 2);

  const coords = points.map((point, index) => [pad + index * stepX, toY(Number(point.value) || 0)]);
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${(pad + (points.length - 1) * stepX).toFixed(1)} ${H - pad} L${pad} ${H - pad} Z`;

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'sparkline');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Evolución del precio: de ${format(values[0] ?? 0)} a ${format(values[values.length - 1] ?? 0)}`);
  svg.innerHTML = `
    <path class="area" d="${area}"/>
    <path class="line" d="${line}" vector-effect="non-scaling-stroke"/>
  `;

  return h('div',
    svg,
    h('div.row.row--between.small.muted', { style: { marginTop: '4px' } },
      h('span', `mín ${format(min)}`),
      h('span', `máx ${format(max)}`),
    ),
  );
}
