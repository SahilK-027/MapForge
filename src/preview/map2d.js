import { colorize, hillshade } from './colorize.js';

// 2D map: native-res canvas with wheel zoom, drag pan and a hover probe.
export function createMap2D(host, onProbe, onRender = () => {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'map2d';
  host.append(canvas);
  const ctx = canvas.getContext('2d');
  let maps = null, cfg = null, shade = null, img = null, layer = 'height';
  let zoom = 1, px = 0, py = 0, drag = null;

  function fit() {
    const { width, height } = host.getBoundingClientRect();
    const size = Math.min(width, height) - 32;
    canvas.style.width = canvas.style.height = `${Math.max(64, size)}px`;
    apply();
  }
  function apply() {
    canvas.style.transform = `translate(${px}px, ${py}px) scale(${zoom})`;
    canvas.classList.toggle('pixelated', zoom * canvas.clientWidth > (maps?.res ?? 1024) * 1.5);
  }
  function render() {
    if (!maps) return;
    colorize(layer, maps, shade, cfg, img.data);
    ctx.putImageData(img, 0, 0);
    onRender();
  }

  host.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = host.getBoundingClientRect();
    const mx = e.clientX - rect.left - rect.width / 2 - px;
    const my = e.clientY - rect.top - rect.height / 2 - py;
    const k = Math.exp(-e.deltaY * 0.0015);
    const nz = Math.min(24, Math.max(0.5, zoom * k));
    px -= mx * (nz / zoom - 1);
    py -= my * (nz / zoom - 1);
    zoom = nz;
    apply();
  }, { passive: false });
  host.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX - px, y: e.clientY - py };
    host.setPointerCapture(e.pointerId);
  });
  host.addEventListener('pointerup', () => (drag = null));
  host.addEventListener('dblclick', () => { zoom = 1; px = py = 0; apply(); });
  host.addEventListener('pointermove', (e) => {
    if (drag) { px = e.clientX - drag.x; py = e.clientY - drag.y; apply(); }
    if (!maps) return;
    const r = canvas.getBoundingClientRect();
    const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height;
    if (u < 0 || v < 0 || u >= 1 || v >= 1) return onProbe(null);
    const res = maps.res;
    const col = Math.floor(u * res), row = Math.floor(v * res);
    const i = row * res + col;
    onProbe({
      x: (col / (res - 1) - 0.5) * cfg.terrain.width,
      z: (row / (res - 1) - 0.5) * cfg.terrain.depth,
      height: maps.height[i], shore: maps.shore[i],
      beach: maps.beach[i], forest: maps.forest[i],
    });
  });
  host.addEventListener('pointerleave', () => onProbe(null));
  new ResizeObserver(fit).observe(host);

  return {
    canvas,
    setMaps(m, c) {
      maps = m; cfg = c;
      if (canvas.width !== m.res) {
        canvas.width = canvas.height = m.res;
        img = ctx.createImageData(m.res, m.res);
      }
      shade = hillshade(m.height, m.res, c.terrain.width / (m.res - 1));
      render();
    },
    setLayer(l) { layer = l; render(); },
    refresh(c) { cfg = c; render(); },
    get shade() { return shade; },
  };
}
