// Port of TerrainGenerator._generateShoreDistField: chamfer distance (metres) from
// every land texel to the nearest water texel, clamped to 100.
export function shoreDistance(heights, res, width, waterLevel) {
  const n = res * res;
  const INF = 1e9;
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = heights[i] < waterLevel ? 0 : INF;

  const D = Math.SQRT2;
  for (let row = 0; row < res; row++) {
    for (let col = 0; col < res; col++) {
      const c = row * res + col;
      if (d[c] === 0) continue;
      let v = d[c];
      if (col > 0) v = Math.min(v, d[c - 1] + 1);
      if (row > 0) {
        v = Math.min(v, d[c - res] + 1);
        if (col > 0) v = Math.min(v, d[c - res - 1] + D);
        if (col < res - 1) v = Math.min(v, d[c - res + 1] + D);
      }
      d[c] = v;
    }
  }
  for (let row = res - 1; row >= 0; row--) {
    for (let col = res - 1; col >= 0; col--) {
      const c = row * res + col;
      if (d[c] === 0) continue;
      let v = d[c];
      if (col < res - 1) v = Math.min(v, d[c + 1] + 1);
      if (row < res - 1) {
        v = Math.min(v, d[c + res] + 1);
        if (col < res - 1) v = Math.min(v, d[c + res + 1] + D);
        if (col > 0) v = Math.min(v, d[c + res - 1] + D);
      }
      d[c] = v;
    }
  }

  const cellW = width / res; // width/res (not res-1): matches the reference bake
  for (let i = 0; i < n; i++) d[i] = Math.min(d[i] * cellW, 100);
  return d;
}
