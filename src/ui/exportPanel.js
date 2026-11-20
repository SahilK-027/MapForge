import { h, download, toast } from './dom.js';
import { MAPS, FORMATS, RESOLUTIONS } from '../export/maps.js';
import { NATIVE_RES } from '../generation/defaults.js';

const resLabel = (r) => (r >= 1024 ? `${r / 1024}K` : `${r}`);

export function createExportPanel(host, store) {
  const state = { maps: new Set(['height']), res: new Set([NATIVE_RES]), fmt: 'bin', quality: 0.92, zip: true };
  let busy = false;

  const mapList = h('div', { class: 'checks' }, Object.entries(MAPS).map(([k, m]) => {
    const cb = h('input', { type: 'checkbox', checked: state.maps.has(k), onchange: () => { cb.checked ? state.maps.add(k) : state.maps.delete(k); update(); } });
    return h('label', { class: 'check' }, cb, h('span', {}, m.label));
  }));

  const resChips = h('div', { class: 'chips' }, RESOLUTIONS.map((r) => {
    const b = h('button', { class: `chip ${state.res.has(r) ? 'on' : ''}`, 'data-tip': r === NATIVE_RES ? 'Native resolution: exact generator output' : `${r}×${r}, resampled from the native 1024 field (not exact)`, onclick: () => {
      state.res.has(r) ? state.res.delete(r) : state.res.add(r);
      b.classList.toggle('on', state.res.has(r));
      update();
    } }, resLabel(r), r === NATIVE_RES ? h('em', {}, 'native') : null);
    return b;
  }));

  const fmtSel = h('div', { class: 'seg' }, Object.entries(FORMATS).map(([k, f]) =>
    h('button', { class: k === state.fmt ? 'on' : '', 'data-fmt': k, onclick: () => { state.fmt = k; update(); } }, f.label.replace('Raw Float32 ', 'Raw ').replace(' 8-bit', ''))));

  const q = h('input', { type: 'range', min: 0.5, max: 1, step: 0.01, value: state.quality, oninput: () => { state.quality = +q.value; qv.textContent = `${Math.round(state.quality * 100)}`; } });
  const qv = h('span', { class: 'qv' }, '92');
  const qRow = h('div', { class: 'quality' }, h('span', {}, 'Quality'), q, qv);
  const zipCb = h('input', { type: 'checkbox', checked: true, onchange: () => (state.zip = zipCb.checked) });
  const notes = h('div', { class: 'notes' });
  const btn = h('button', { class: 'primary wide', onclick: run }, 'Export');
  const bar = h('div', { class: 'bar' }, h('i'));
  const status = h('div', { class: 'status' });

  host.append(
    h('h2', {}, 'Export'),
    h('div', { class: 'field' }, h('div', { class: 'flabel' }, 'Maps'), mapList),
    h('div', { class: 'field' }, h('div', { class: 'flabel' }, 'Resolution'), resChips),
    h('div', { class: 'field' }, h('div', { class: 'flabel' }, 'Format'), fmtSel, qRow),
    h('label', { class: 'check' }, zipCb, h('span', {}, 'Bundle as .zip (includes preset)')),
    notes, btn, bar, status,
  );

  function jobs() {
    const out = [];
    for (const map of state.maps) {
      if (!MAPS[map].formats.includes(state.fmt)) continue;
      for (const res of [...state.res].sort((a, b) => a - b)) out.push({ map, res, fmt: state.fmt });
    }
    return out;
  }

  function update() {
    for (const b of fmtSel.children) b.classList.toggle('on', b.dataset.fmt === state.fmt);
    const f = FORMATS[state.fmt];
    qRow.style.display = f.lossy ? '' : 'none';
    const list = [];
    const skipped = [...state.maps].filter((m) => !MAPS[m].formats.includes(state.fmt));
    if (state.res.has(NATIVE_RES) && state.fmt === 'bin' && state.maps.has('height')) list.push(['ok', '1K raw height = exact generator output (Float32 LE).']);
    if ([...state.res].some((r) => r !== NATIVE_RES)) list.push(['warn', 'Non-1K sizes are resampled (Lanczos down / bicubic up): not exact.']);
    if (f.lossy) list.push(['warn', `${state.fmt.toUpperCase()} is lossy: use for previews, not as height data.`]);
    if (state.fmt !== 'bin' && state.fmt !== 'png16') list.push(['info', '8-bit images quantize values to 256 levels.']);
    if (skipped.length) list.push(['info', `${skipped.map((m) => MAPS[m].label).join(', ')}: not available as ${f.label}.`]);
    if (state.res.has(8192)) list.push(['info', '8K is encoded in strips and can take a while.']);
    notes.replaceChildren(...list.map(([k, t]) => h('p', { class: k }, t)));
    const n = jobs().length;
    btn.disabled = busy || !n || !store.maps;
    btn.textContent = busy ? 'Exporting…' : n ? `Export ${n} map${n > 1 ? 's' : ''}` : 'Nothing to export';
  }

  function run() {
    if (busy || !store.maps) return;
    const list = jobs();
    if (!list.length) return;
    busy = true;
    update();
    bar.classList.add('active');
    const w = new Worker(new URL('../export/worker.js', import.meta.url), { type: 'module' });
    const seed = store.cfg.procedural.seed;
    w.onmessage = ({ data: m }) => {
      if (m.type === 'progress') bar.firstChild.style.width = `${m.t * 100}%`;
      else if (m.type === 'status') status.textContent = m.text;
      else {
        w.terminate();
        busy = false;
        bar.classList.remove('active');
        bar.firstChild.style.width = '0';
        status.textContent = '';
        if (m.type === 'error') { console.error(m.error); toast('Export failed — see console', 'err'); }
        else { m.files.forEach((f) => download(f.blob, f.name)); toast(`Exported ${m.files.length} file${m.files.length > 1 ? 's' : ''}`); }
        update();
      }
    };
    const { height, shore, beach, forest, stats, res } = store.maps;
    w.postMessage({ jobs: list, maps: { height, shore, beach, forest, stats, res }, cfg: store.cfg, quality: state.quality, zip: state.zip, zipName: `remnance-map-seed${seed}.zip` });
  }

  update();
  return { update, run };
}
