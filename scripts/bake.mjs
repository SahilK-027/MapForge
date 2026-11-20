// Writes the native 1024 maps for the default (or a preset) config to ./baked.
// usage: npm run bake [-- preset.json]
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { generateMaps } from '../src/generation/generate.js';
import { DEFAULTS, clone } from '../src/generation/defaults.js';
import { buildMeta } from '../src/export/meta.js';

const cfg = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], 'utf8')) : clone(DEFAULTS);
const maps = generateMaps(cfg);
mkdirSync('baked', { recursive: true });
for (const key of ['height', 'shore', 'beach', 'forest']) {
  const a = maps[key];
  writeFileSync(`baked/${key}_1024.bin`, new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  const meta = buildMeta(key, maps.res, cfg, key === 'height' ? maps.stats : null, true);
  writeFileSync(`baked/${key}_1024.json`, JSON.stringify(meta, null, 2));
}
console.log(`baked → ./baked (seed ${cfg.procedural.seed}, height ${maps.stats.min.toFixed(3)}…${maps.stats.max.toFixed(3)})`);
