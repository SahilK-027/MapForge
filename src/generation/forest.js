// Forest suitability: [0,1] score for where groves can grow (moisture, treeline, grove noise).
// Not actual tree placement.
import { smoothstep as ss } from './math.js';

function valueNoise2D(x, z, seed = 0) {
  const ix = Math.floor(x),
    iz = Math.floor(z);
  const fx = x - ix,
    fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  function hash(a, b) {
    let h = (a * 1619 + b * 31337 + seed * 6791) | 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    return ((h ^ (h >>> 16)) >>> 0) / 0xffffffff;
  }
  return (
    hash(ix, iz) * (1 - ux) * (1 - uz) +
    hash(ix + 1, iz) * ux * (1 - uz) +
    hash(ix, iz + 1) * (1 - ux) * uz +
    hash(ix + 1, iz + 1) * ux * uz
  );
}

function fbm(x, z, octaves, seed) {
  let value = 0,
    amplitude = 0.5,
    frequency = 1,
    max = 0;
  for (let i = 0; i < octaves; i++) {
    value += valueNoise2D(x * frequency, z * frequency, seed + i * 97) * amplitude;
    max += amplitude;
    amplitude *= 0.5;
    frequency *= 2.1;
  }
  return value / max;
}

export function forestSuitability(f, heightAt, waterLevel, width, depth, res) {
  const out = new Float32Array(res * res);
  for (let row = 0; row < res; row++) {
    const z = (row / (res - 1) - 0.5) * depth;
    for (let col = 0; col < res; col++) {
      const x = (col / (res - 1) - 0.5) * width;
      const h = heightAt(x, z);
      if (h < waterLevel) continue; // no forest underwater
      const moist = 1 - ss(0, f.moistureRange, h - waterLevel);
      const elev = 1 - ss(f.treelineStart, f.treelineHeight, h);
      const grove = ss(
        f.forestZoneThreshold - f.groveContrast,
        f.forestZoneThreshold + f.groveContrast,
        fbm(x * f.forestZoneScale, z * f.forestZoneScale, 4, f.seed),
      );
      out[row * res + col] = elev * grove * (f.lowlandBias + (1 - f.lowlandBias) * moist);
    }
  }
  return out;
}
