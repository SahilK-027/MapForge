export const LAYERS = [
  { key: 'height', label: 'Height' },
  { key: 'hillshade', label: 'Hillshade' },
  { key: 'water', label: 'Water' },
  { key: 'shore', label: 'Shore dist' },
  { key: 'beach', label: 'Beach' },
  { key: 'forest', label: 'Forest' },
];

// Hypsometric stops: [height above water (m), r, g, b]
const LAND = [
  [0, 222, 206, 160],
  [1.5, 150, 170, 96],
  [5, 96, 140, 70],
  [10, 70, 112, 56],
  [16, 128, 118, 96],
  [22, 196, 188, 172],
  [30, 244, 242, 236],
];
const lerp = (a, b, t) => a + (b - a) * t;
function ramp(stops, v, out) {
  if (v <= stops[0][0]) {
    out[0] = stops[0][1]; out[1] = stops[0][2]; out[2] = stops[0][3];
    return out;
  }
  for (let i = 1; i < stops.length; i++) {
    if (v <= stops[i][0]) {
      const a = stops[i - 1], b = stops[i];
      const t = (v - a[0]) / (b[0] - a[0]);
      out[0] = lerp(a[1], b[1], t); out[1] = lerp(a[2], b[2], t); out[2] = lerp(a[3], b[3], t);
      return out;
    }
  }
  const l = stops[stops.length - 1];
  out[0] = l[1]; out[1] = l[2]; out[2] = l[3];
  return out;
}

export function hillshade(h, res, cellW) {
  const out = new Float32Array(res * res);
  const lx = -0.6, ly = 0.55, lz = -0.58; // light from north-west, ~35° up
  for (let r = 0; r < res; r++) {
    for (let c = 0; c < res; c++) {
      const i = r * res + c;
      const dx = (h[r * res + Math.min(res - 1, c + 1)] - h[r * res + Math.max(0, c - 1)]) / (2 * cellW);
      const dz = (h[Math.min(res - 1, r + 1) * res + c] - h[Math.max(0, r - 1) * res + c]) / (2 * cellW);
      const len = Math.hypot(dx, 1, dz);
      out[i] = Math.max(0, (-dx * lx + ly - dz * lz) / len);
    }
  }
  return out;
}

function waterColor(depth, out) {
  const t = Math.min(1, depth / 7);
  out[0] = lerp(96, 18, t); out[1] = lerp(196, 70, t); out[2] = lerp(196, 112, t);
  return out;
}

export function landColor(hAbove, out) {
  return ramp(LAND, hAbove, out);
}

export function colorize(layer, maps, shade, cfg, rgba) {
  const { res, height, shore, beach, forest } = maps;
  const lvl = cfg.water.level;
  const c = [0, 0, 0];
  const cut = cfg.procedural.beachGrassCut ?? 0.25;
  for (let i = 0; i < res * res; i++) {
    const h = height[i];
    const wet = h < lvl;
    const s = shade[i];
    const sh = 0.45 + 0.75 * s;
    let r, g, b;
    switch (layer) {
      case 'height':
        if (wet) waterColor(lvl - h, c), (r = c[0]), (g = c[1]), (b = c[2]);
        else landColor(h - lvl, c), (r = c[0] * sh), (g = c[1] * sh), (b = c[2] * sh);
        break;
      case 'hillshade':
        r = g = b = wet ? 40 + 40 * s : 30 + 215 * s;
        break;
      case 'water':
        if (wet) waterColor(lvl - h, c), (r = c[0]), (g = c[1]), (b = c[2]);
        else r = g = b = 34 + 30 * s;
        break;
      case 'shore': {
        if (wet) { r = 20; g = 34; b = 48; break; }
        const t = Math.min(1, shore[i] / 60);
        r = lerp(255, 40, t) * sh * 0.8; g = lerp(214, 36, t) * sh * 0.8; b = lerp(120, 60, t) * sh * 0.8;
        break;
      }
      case 'beach': {
        const base = wet ? 30 : 34 + 30 * s;
        const v = beach[i];
        const bare = v > cut ? 1 : 0.55;
        r = lerp(base, 238 * bare, v); g = lerp(base, 214 * bare, v); b = lerp(base, 150 * bare, v);
        break;
      }
      case 'forest': {
        if (wet) { r = 22; g = 36; b = 48; break; }
        const v = forest[i];
        const base = 40 + 40 * s;
        r = lerp(base, 46 * sh, v); g = lerp(base, 150 * sh, v); b = lerp(base, 62 * sh, v);
        break;
      }
    }
    const o = i * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
  }
  return rgba;
}
