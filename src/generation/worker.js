import { generateMaps } from './generate.js';

self.onmessage = ({ data: { id, cfg } }) => {
  try {
    const t0 = performance.now();
    let last = 0;
    const maps = generateMaps(cfg, (stage, t) => {
      const now = performance.now();
      if (now - last > 50 || t === 1) {
        last = now;
        self.postMessage({ id, type: 'progress', stage, t });
      }
    });
    const transfer = ['height', 'shore', 'beach', 'forest'].map((k) => maps[k].buffer);
    self.postMessage({ id, type: 'done', maps, ms: performance.now() - t0 }, transfer);
  } catch (e) {
    self.postMessage({ id, type: 'error', error: String(e?.stack ?? e) });
  }
};
