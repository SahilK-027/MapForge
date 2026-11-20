// Port of Trees' outer-coast beachFactor: ~1 on the sandy shelf near the island
// rim (radial band × height band up to beachSandHeight), 0 inland and underwater.
import { smoothstep as ss } from './math.js';

export function beachMask(p, heightAt, waterLevel, width, depth, res) {
  const out = new Float32Array(res * res);
  const sand = p.beachSandHeight ?? 1.8;
  for (let row = 0; row < res; row++) {
    const z = (row / (res - 1) - 0.5) * depth;
    for (let col = 0; col < res; col++) {
      const x = (col / (res - 1) - 0.5) * width;
      const nearRim = ss(p.islandRadius - p.beachWidth * 1.6, p.islandRadius - p.beachWidth, Math.hypot(x, z));
      if (nearRim <= 0) continue;
      const dFW = heightAt(x, z) - waterLevel;
      if (dFW < 0) continue; // land only
      out[row * res + col] = nearRim * (1 - ss(sand - 0.6, sand, dFW));
    }
  }
  return out;
}
