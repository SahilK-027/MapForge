import './styles.css';
import { DEFAULTS, clone } from './generation/defaults.js';
import { PRESETS } from './generation/presets.js';
import { getPath, setPath } from './ui/schema.js';
import { h, installTooltips, toast, download } from './ui/dom.js';
import { createPanel } from './ui/panel.js';
import { createExportPanel } from './ui/exportPanel.js';
import { createMap2D } from './preview/map2d.js';
import { createView3D } from './preview/view3d.js';
import { LAYERS } from './preview/colorize.js';

const $ = (s) => document.querySelector(s);

const store = {
  defaults: clone(DEFAULTS),
  cfg: clone(DEFAULTS),
  maps: null,
  auto: true,
  changed() { onConfigChange(); },
  resetPaths(paths) {
    for (const p of paths) setPath(store.cfg, p, getPath(store.defaults, p));
    onConfigChange();
  },
};

installTooltips();
const panel = createPanel($('#params'), store);
const exporter = createExportPanel($('#export'), store);
const probe = $('#probe');
const map2d = createMap2D($('#view2d'), showProbe, () => view3d?.refreshTexture());
const view3d = createView3D($('#view3d'), map2d.canvas);

// ── header controls ──────────────────────────────────────────────────────────
const seedInput = $('#seed');
seedInput.addEventListener('change', () => {
  const v = parseInt(seedInput.value, 10);
  if (Number.isFinite(v)) { store.cfg.procedural.seed = v; onConfigChange(); }
});
$('#dice').addEventListener('click', randomSeed);
$('#regen').addEventListener('click', () => regenerate());
$('#auto').addEventListener('change', (e) => (store.auto = e.target.checked));
$('#reset-all').addEventListener('click', () => {
  store.cfg = clone(DEFAULTS);
  onConfigChange(true);
});
$('#preset-save').addEventListener('click', () => {
  download(new Blob([JSON.stringify(store.cfg, null, 2)], { type: 'application/json' }), `mapforge-preset-seed${store.cfg.procedural.seed}.json`);
});
$('#preset-load').addEventListener('click', () => $('#preset-file').click());
$('#preset-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    store.cfg = merge(clone(DEFAULTS), JSON.parse(await file.text()));
    onConfigChange(true);
    toast(`Loaded ${file.name}`);
  } catch (err) {
    toast(`Invalid preset: ${err.message}`, 'err');
  }
});

function merge(base, over) {
  for (const k of Object.keys(base)) {
    if (!(k in over)) continue;
    const b = base[k], o = over[k];
    if (Array.isArray(b)) base[k] = Array.isArray(o) ? o.map((x, i) => (typeof x === 'object' ? merge(clone(b[i] ?? b[0]), x) : x)) : b;
    else if (b && typeof b === 'object') merge(b, o ?? {});
    else if (typeof o === typeof b) base[k] = o;
  }
  return base;
}

function randomSeed() {
  store.cfg.procedural.seed = (Math.random() * 100000) | 0;
  onConfigChange(true);
}

const presetSel = $('#preset');
presetSel.append(h('option', { value: '', disabled: true }, 'Preset…'), ...PRESETS.map((p) => h('option', { value: p.id, title: p.desc }, p.name)));
presetSel.addEventListener('change', () => {
  const p = PRESETS.find((x) => x.id === presetSel.value);
  if (!p) return;
  store.cfg = p.cfg();
  onConfigChange(true);
  toast(`${p.name}: ${p.desc}`);
});
function syncPreset() {
  const key = JSON.stringify(store.cfg);
  presetSel.value = PRESETS.find((p) => JSON.stringify(p.cfg()) === key)?.id ?? '';
}

// ── tabs + layers ────────────────────────────────────────────────────────────
let tab = '2d';
function setTab(t) {
  tab = t;
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  $('#view2d').hidden = t !== '2d';
  $('#view3d').hidden = t !== '3d';
  $('#tools3d').hidden = t !== '3d';
  view3d.setVisible(t === '3d');
}
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

const layerBar = $('#layers');
LAYERS.forEach((l, i) => layerBar.append(h('button', { class: i ? '' : 'on', 'data-layer': l.key, 'data-tip': `${l.label} (${i + 1})`, onclick: () => setLayer(l.key) }, l.label)));
function setLayer(k) {
  layerBar.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.layer === k));
  map2d.setLayer(k);
}
$('#exag').addEventListener('input', (e) => { view3d.setExaggeration(+e.target.value); $('#exagv').textContent = `${(+e.target.value).toFixed(1)}×`; });
$('#cam-reset').addEventListener('click', () => view3d.resetCamera());

// ── keyboard ─────────────────────────────────────────────────────────────────
addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'r') regenerate();
  else if (k === 'e') exporter.run();
  else if (k === 'd') randomSeed();
  else if (k === 'v') setTab(tab === '2d' ? '3d' : '2d');
  else if (/^[1-6]$/.test(k)) { setLayer(LAYERS[+k - 1].key); }
  else return;
  e.preventDefault();
});

// ── generation ───────────────────────────────────────────────────────────────
let worker = null, jobId = 0, timer = 0;
const progress = $('#progress');

function onConfigChange(immediate) {
  seedInput.value = store.cfg.procedural.seed;
  panel.sync();
  updateBadge();
  syncPreset();
  if (!store.auto) return markStale(true);
  clearTimeout(timer);
  timer = setTimeout(regenerate, immediate ? 0 : 350);
}

function markStale(v) { $('#regen').classList.toggle('stale', v); }

function updateBadge() {
  const exact = JSON.stringify(store.cfg) === JSON.stringify(store.defaults);
  const b = $('#badge');
  b.textContent = exact ? 'Default · unchanged' : 'Custom';
  b.className = `badge ${exact ? 'exact' : ''}`;
  b.dataset.tip = exact ? 'Default Island preset, unchanged.' : 'Config differs from the default preset.';
}

function regenerate() {
  clearTimeout(timer);
  if (worker) worker.terminate();
  worker = new Worker(new URL('./generation/worker.js', import.meta.url), { type: 'module' });
  const id = ++jobId;
  const cfg = clone(store.cfg);
  progress.classList.add('active');
  setProgress('Generating', 0);
  markStale(false);
  worker.onmessage = ({ data: m }) => {
    if (m.id !== id) return;
    if (m.type === 'progress') setProgress(STAGE[m.stage] ?? m.stage, m.t);
    else if (m.type === 'error') { progress.classList.remove('active'); console.error(m.error); toast('Generation failed — see console', 'err'); }
    else {
      worker.terminate();
      worker = null;
      store.maps = m.maps;
      map2d.setMaps(m.maps, cfg);
      view3d.setMaps(m.maps, cfg);
      exporter.update();
      progress.classList.remove('active');
      $('#gen-time').textContent = `${(m.ms / 1000).toFixed(2)} s · ${m.maps.stats.min.toFixed(2)} … ${m.maps.stats.max.toFixed(2)} m`;
    }
  };
  worker.postMessage({ id, cfg });
}

const STAGE = { height: 'Height field', water: 'Water network', shore: 'Shore distance', beach: 'Beach mask', forest: 'Forest', done: 'Done' };
function setProgress(label, t) {
  progress.querySelector('i').style.width = `${(t * 100).toFixed(1)}%`;
  progress.querySelector('span').textContent = `${label} · ${Math.round(t * 100)}%`;
}

function showProbe(p) {
  if (!p) return (probe.hidden = true);
  probe.hidden = false;
  probe.innerHTML = `
    <span>x <b>${p.x.toFixed(1)}</b> z <b>${p.z.toFixed(1)}</b></span>
    <span>h <b>${p.height.toFixed(3)}</b> m</span>
    <span>shore <b>${p.shore.toFixed(1)}</b> m</span>
    <span>beach <b>${p.beach.toFixed(2)}</b></span>
    <span>forest <b>${p.forest.toFixed(2)}</b></span>`;
}

setTab('2d');
onConfigChange(true);
