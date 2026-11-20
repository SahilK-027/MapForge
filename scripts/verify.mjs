// Bit-exact check: bundles the GAME's original TerrainGenerator / TerrainNoise code
// (read-only, from GAME_SRC) and this tool's ports, runs both with the GAME's own config
// (read from its gameConfig.js at run time, never stored in this repo) and compares every
// value bit-for-bit.
//   --write-preset <file>  also save that config as a MapForge preset (keep it out of git).
import { build } from 'esbuild';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const GAME_SRC = resolve(process.env.GAME_SRC ?? join(homedir(), 'Desktop/Remnance/src'));
if (!existsSync(GAME_SRC)) {
  console.error(`Game source not found at ${GAME_SRC} (set GAME_SRC)`);
  process.exit(2);
}
const T = join(GAME_SRC, 'Game/World/Components/Terrain');

// Engine singletons TerrainGenerator imports but the CPU bake never touches.
const STUBS = {
  'Game.class': 'export default {};',
  'PerlinNoise.class': 'export default class PerlinNoise {};',
  waterShared: 'export const waterBedUniforms = {};',
  heightFieldPrefetch: 'export const takePrefetchedHeightField = () => null;',
};
const stubPlugin = {
  name: 'stubs',
  setup(b) {
    b.onResolve({ filter: /.*/ }, (a) => {
      const key = Object.keys(STUBS).find((k) => a.path.endsWith('/' + k) || a.path.endsWith('/' + k + '.js'));
      return key ? { path: key, namespace: 'stub' } : undefined;
    });
    b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: STUBS[a.path], loader: 'js' }));
  },
};

const gameEntry = `
import TerrainGenerator from ${JSON.stringify(join(T, 'TerrainGenerator.class.js'))};
import { DEFAULT_TERRAIN_PARAMS } from ${JSON.stringify(join(T, 'TerrainNoise.js'))};
import GAME_CONFIG from ${JSON.stringify(join(GAME_SRC, 'Config/gameConfig.js'))};
export function run() {
  const { terrain } = GAME_CONFIG;
  // Same fields the real constructor sets before calling _generateHeightField().
  const self = Object.create(TerrainGenerator.prototype);
  Object.assign(self, {
    width: terrain.width, depth: terrain.depth, maxHeight: terrain.maxHeight,
    proceduralParams: { ...DEFAULT_TERRAIN_PARAMS, ...(terrain.procedural || {}) },
    waterLevel: GAME_CONFIG.water.level,
    _cpuBakeRes: 1024, _cpuBakedHeights: null, heightFieldTexture: null,
  });
  self._generateHeightField();
  const t = GAME_CONFIG.trees ?? {};
  const forest = {};
  for (const k of ['seed', 'forestZoneScale', 'forestZoneThreshold', 'groveContrast', 'moistureRange', 'lowlandBias', 'treelineStart', 'treelineHeight']) if (k in t) forest[k] = t[k];
  return {
    cfg: {
      terrain: { width: terrain.width, depth: terrain.depth, maxHeight: terrain.maxHeight, segments: terrain.segments },
      procedural: self.proceduralParams,
      water: { level: GAME_CONFIG.water.level },
      forest,
    },
    height: self._cpuBakedHeights,
    shore: self.shoreDistTexture.image.data,
  };
}`;

const toolEntry = `
import { generateMaps } from ${JSON.stringify(join(root, 'src/generation/generate.js'))};
import { DEFAULTS, clone } from ${JSON.stringify(join(root, 'src/generation/defaults.js'))};
export function run(game) {
  const cfg = clone(DEFAULTS);
  Object.assign(cfg.terrain, game.terrain);
  cfg.procedural = { ...game.procedural };
  cfg.water = { ...game.water };
  Object.assign(cfg.forest, game.forest);
  return { cfg, maps: generateMaps(cfg) };
}`;

const dir = mkdtempSync(join(tmpdir(), 'mapforge-verify-'));
async function bundle(contents, name, resolveDir) {
  const outfile = join(dir, name + '.mjs');
  await build({
    stdin: { contents, resolveDir, loader: 'js' },
    bundle: true, platform: 'node', format: 'esm', outfile, logLevel: 'error',
    plugins: [stubPlugin],
  });
  return import(pathToFileURL(outfile).href);
}

try {
  const game = await bundle(gameEntry, 'game', GAME_SRC);
  const tool = await bundle(toolEntry, 'tool', root);
  let t0 = performance.now();
  const g = game.run();
  const gMs = performance.now() - t0;
  t0 = performance.now();
  const { cfg, maps: m } = tool.run(g.cfg);
  const tMs = performance.now() - t0;
  console.log(`game ${gMs.toFixed(0)} ms · tool ${tMs.toFixed(0)} ms\n`);

  let fail = false;
  for (const key of ['height', 'shore']) {
    const a = g[key], b = m[key];
    if (a.length !== b.length || a.constructor !== b.constructor) {
      console.log(`✗ ${key}: shape/type mismatch (${a.constructor.name}[${a.length}] vs ${b.constructor.name}[${b.length}])`);
      fail = true;
      continue;
    }
    const ab = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    const bb = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
    const w = a.BYTES_PER_ELEMENT;
    let diff = 0, maxAbs = 0;
    for (let i = 0; i < a.length; i++) {
      for (let k = 0; k < w; k++) {
        if (ab[i * w + k] !== bb[i * w + k]) {
          diff++;
          maxAbs = Math.max(maxAbs, Math.abs(a[i] - b[i]));
          break;
        }
      }
    }
    const label = `${key.padEnd(8)} ${a.constructor.name}[${a.length}]`;
    if (diff) fail = true;
    console.log(diff ? `✗ ${label}: ${diff} values differ (max |Δ| ${maxAbs})` : `✓ ${label}: 0 differing values (bit-identical)`);
  }
  const wi = process.argv.indexOf('--write-preset');
  if (wi > 0) {
    writeFileSync(process.argv[wi + 1], JSON.stringify(cfg, null, 2));
    console.log(`\nwrote game preset → ${process.argv[wi + 1]} (keep it private)`);
  }
  console.log('\nNot compared (no standalone game function to call): beach mask, forest suitability.');
  console.log(fail ? '\nVERIFY FAILED' : '\nVERIFY PASSED — maps generated from the game config are bit-identical to the game.');
  process.exitCode = fail ? 1 : 0;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
