// Separable resampling of a square native field to dst×dst, corner-aligned like the
// height grid (sample i sits at i/(res-1) of the world). Lanczos3 when shrinking,
// Catmull-Rom bicubic when growing, nearest for categorical maps. Rows are produced
// on demand so 8K outputs never need the whole destination in memory.

const sinc = (x) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
const lanczos3 = (x) => (Math.abs(x) < 3 ? sinc(x) * sinc(x / 3) : 0);
function catmullRom(x) {
  x = Math.abs(x);
  if (x < 1) return 1.5 * x * x * x - 2.5 * x * x + 1;
  if (x < 2) return -0.5 * x * x * x + 2.5 * x * x - 4 * x + 2;
  return 0;
}

function weights(src, dst, mode) {
  const scale = (src - 1) / (dst - 1);
  const down = scale > 1;
  const support = mode === 'nearest' ? 0 : down ? 3 * scale : 2;
  const taps = [];
  for (let i = 0; i < dst; i++) {
    const c = i * scale;
    if (mode === 'nearest') {
      taps.push({ idx: [Math.min(src - 1, Math.round(c))], w: [1] });
      continue;
    }
    const idx = [], w = [];
    let sum = 0;
    for (let s = Math.floor(c - support) + 1; s <= Math.ceil(c + support); s++) {
      const d = s - c;
      const k = down ? lanczos3(d / scale) : catmullRom(d);
      if (k === 0) continue;
      idx.push(Math.max(0, Math.min(src - 1, s)));
      w.push(k);
      sum += k;
    }
    for (let k = 0; k < w.length; k++) w[k] /= sum;
    taps.push({ idx, w });
  }
  return taps;
}

export function createResampler(field, src, dst, mode = 'smooth') {
  if (dst === src) {
    return (row, out) => {
      for (let i = 0; i < dst; i++) out[i] = field[row * src + i];
      return out;
    };
  }
  const tx = weights(src, dst, mode);
  const ty = weights(src, dst, mode);
  // horizontal pass: src rows × dst cols (≤ 1024 × 8192 floats)
  const tmp = new Float32Array(src * dst);
  for (let r = 0; r < src; r++) {
    const base = r * src;
    for (let i = 0; i < dst; i++) {
      const { idx, w } = tx[i];
      let v = 0;
      for (let k = 0; k < idx.length; k++) v += field[base + idx[k]] * w[k];
      tmp[r * dst + i] = v;
    }
  }
  return (row, out) => {
    const { idx, w } = ty[row];
    out.fill(0);
    for (let k = 0; k < idx.length; k++) {
      const base = idx[k] * dst;
      const wk = w[k];
      for (let i = 0; i < dst; i++) out[i] += tmp[base + i] * wk;
    }
    return out;
  };
}
