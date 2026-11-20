import { h } from './dom.js';
import { GROUPS, getPath, setPath } from './schema.js';

const decimals = (step) => Math.max(0, -Math.floor(Math.log10(step)));

// Sidebar of collapsible parameter groups. onChange(path) fires after cfg is mutated.
export function createPanel(host, store) {
  const rows = new Map();
  const groupEls = new Map();
  const open = new Set(['world', 'rivers']);

  for (const g of GROUPS) {
    const count = h('span', { class: 'count' });
    const reset = h('button', { class: 'icon-btn', 'data-tip': `Reset ${g.title} to defaults`, onclick: (e) => { e.stopPropagation(); store.resetPaths(g.params.map((p) => p.path)); } }, '↺');
    const body = h('div', { class: 'group-body' });
    const el = h('section', { class: `group ${open.has(g.id) ? 'open' : ''}` },
      h('header', { onclick: () => el.classList.toggle('open') }, h('span', { class: 'chev' }, '›'), h('span', { class: 'title' }, g.title), count, reset),
      body);
    for (const p of g.params) body.append(row(p));
    host.append(el);
    groupEls.set(g, { count, el });
  }

  function row(p) {
    const fmt = (v) => (Number.isInteger(p.step) ? String(v) : (+v).toFixed(Math.max(decimals(p.step), 0)).replace(/\.?0+$/, '') || '0');
    const range = h('input', { type: 'range', min: p.min, max: p.max, step: p.step });
    const num = h('input', { type: 'number', step: p.step, class: 'num' });
    const dot = h('span', { class: 'dirty', 'data-tip': 'Changed from default — click to reset', onclick: () => store.resetPaths([p.path]) });
    const el = h('div', { class: 'param' },
      h('label', { 'data-tip': p.tip }, p.label),
      dot, range, num);
    const commit = (v, live) => {
      if (!Number.isFinite(v)) return;
      setPath(store.cfg, p.path, v);
      sync(p.path, live);
      store.changed(p.path);
    };
    range.addEventListener('input', () => commit(+range.value, true));
    num.addEventListener('change', () => commit(parseFloat(num.value)));
    num.addEventListener('keydown', (e) => e.key === 'Enter' && num.blur());
    rows.set(p.path, { p, range, num, el, fmt });
    return el;
  }

  function sync(only, fromRange) {
    for (const [path, r] of rows) {
      if (only && path !== only) continue;
      const v = getPath(store.cfg, path);
      if (!fromRange) r.range.value = v;
      if (document.activeElement !== r.num) r.num.value = fromRange ? r.fmt(v) : v;
      r.el.classList.toggle('modified', v !== getPath(store.defaults, path));
    }
    for (const [g, { count }] of groupEls) {
      const n = g.params.filter((p) => getPath(store.cfg, p.path) !== getPath(store.defaults, p.path)).length;
      count.textContent = n ? `${n}` : '';
    }
  }

  sync();
  return { sync: () => sync() };
}
