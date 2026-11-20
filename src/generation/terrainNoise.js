// Ported verbatim from Remnance src/Game/World/Components/Terrain/TerrainNoise.js.
// Only changes: optional onProgress callback, waterLevel read from params (default 3.0).
// `npm run verify` proves the output is bit-identical to the game's.
/**
 * TerrainNoise — seeded procedural height-field generation.
 *
 * Produces the island's entire shape at load time: domain-warped FBM lowlands,
 * ridged highlands with cliff-sharpened terraces (mesas/plateaus), carved
 * shallow river channels, and a noisy coastline that sinks below sea level
 * before the world edge so the island is always surrounded by sea.
 *
 * The generator returns one Float32Array of FINAL world-space heights covering
 * the full terrain extent. TerrainGenerator aliases it as the CPU height bake
 * and wraps it in a DataTexture for the GPU grass-height bake, so every
 * consumer (physics, spawners, shaders) reads the exact same field.
 */

// ── Seeded PRNG ───────────────────────────────────────────────────────────────

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Seeded 2D simplex noise (Gustavson) ──────────────────────────────────────

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRAD = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function createSimplex(seed) {
  const rand = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  // Returns value in [-1, 1]
  return function noise2D(x, y) {
    const s = (x + y) * F2;
    const i = Math.floor(x + s);
    const j = Math.floor(y + s);
    const t = (i + j) * G2;
    const x0 = x - (i - t);
    const y0 = y - (j - t);

    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;

    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;

    const ii = i & 255;
    const jj = j & 255;

    let n0 = 0,
      n1 = 0,
      n2 = 0;

    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      const g = GRAD[perm[ii + perm[jj]] & 7];
      t0 *= t0;
      n0 = t0 * t0 * (g[0] * x0 + g[1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      const g = GRAD[perm[ii + i1 + perm[jj + j1]] & 7];
      t1 *= t1;
      n1 = t1 * t1 * (g[0] * x1 + g[1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      const g = GRAD[perm[ii + 1 + perm[jj + 1]] & 7];
      t2 *= t2;
      n2 = t2 * t2 * (g[0] * x2 + g[1] * y2);
    }
    return 70.14 * (n0 + n1 + n2);
  };
}

// ── Shaping helpers ──────────────────────────────────────────────────────────

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Schlick-style gain: k = 1 is identity, higher k snaps the 0→1 transition to
// the midpoint — used to turn smooth terrace ramps into near-vertical cliffs.
function gain(x, k) {
  const c = x < 0.5 ? x : 1 - x;
  const a = 0.5 * Math.pow(2 * c, k);
  return x < 0.5 ? a : 1 - a;
}

// ── Default shaping parameters ───────────────────────────────────────────────
// All frequencies are per-world-unit; amplitudes in normalized elevation [0,1]
// unless noted. Tuned for a 1024×1024 world with maxHeight ≈ 55.

export const DEFAULT_TERRAIN_PARAMS = {
  seed: 1337,

  // Domain warp — bends every downstream pattern so nothing reads as grid noise
  warpFreq: 0.004,
  warpAmp: 20, // world units of coordinate displacement

  // Continental base — mostly-FLAT meadows with gentle rolling hills.
  // pow(base, baseFlatness) compresses the low end so wide areas sit near
  // baseFloor and only occasional broad swells rise toward baseAmp.
  baseFreq: 0.0028,
  baseFloor: 0.13, // min normalized elevation of dry lowlands
  baseAmp: 0.18,
  baseFlatness: 2.3,

  // Small hill detail layered everywhere
  hillFreq: 0.012,
  hillAmp: 0.03,

  // ── Macro composition (Genshin-style) ──────────────────────────────────────
  // Meadow basin at the island centre (no highlands allowed inside), highlands
  // increasingly favoured toward the coast so cliffs/mesas RING the meadows
  // instead of piling up on one side. rimBias 0 at centre → 1 near the rim.
  basinRadius: 115, // highland-free meadow zone around the centre (lake + shore)
  rimBiasStart: 170, // dist where rim bias starts helping highlands
  rimBiasEnd: 390, // dist where rim bias is full strength
  rimBiasWeight: 0.18, // gentle coastal favour; noise dominates placement

  // Lake — shallow basin carved somewhere in the island interior. Centre is
  // seed-picked within lakeOffsetMax of the map centre and the basin is
  // elliptical with a seed-picked orientation, so it is neither always
  // central nor always circular. Edge is noise-perturbed so the shore is
  // irregular.
  lakeRadius: 60, // full-depth core radius (short axis reference)
  lakeShoreWidth: 45, // soft slope band out to meadow level
  lakeBedLevel: 1.0, // world height of lake floor (waterLevel is 3)
  lakeEdgeNoiseAmp: 25, // world units of shoreline irregularity
  lakeOffsetMax: 140, // max seed-driven displacement of lake centre from map centre
  lakeAspectMin: 1.15, // min long/short axis ratio of the elliptical basin
  lakeAspectMax: 1.9, // max long/short axis ratio

  // Highland zones — DISCRETE mesa regions; the rest stays lowland meadow.
  highlandFreq: 0.0036,
  highlandThreshold: 0.55,
  highlandSoftness: 0.1,

  // Plateau relief inside highlands — smooth field flattened into mesa tops
  ridgeFreq: 0.004,
  ridgeAmp: 0.62,
  plateauFlatness: 2.5, // gain applied to the plateau field: higher = flatter tops, steeper sides

  // Terracing — applied ONLY to the highland lift (the rise above the
  // surrounding meadow), so mesas step up in tiers while lowlands stay smooth.
  terraceSteps: 3,
  cliffSharpness: 6.0,
  cliffBandFreq: 0.02, // noise deciding cliff-vs-ramp along a plateau edge
  cliffBandCoverage: 0.5, // 0 = all ramps, 1 = all sheer cliff

  // Ramp corridors — connected |fbm| bands where terracing/cliff-sharpening is
  // suppressed and the highland lift stays a smooth walkable slope. Guarantees
  // every mesa is crossed by natural switchback paths up from the lowlands.
  rampFreq: 0.005,
  rampWidth: 0.09, // corridor half-width in noise space

  // Rivers — |fbm| channel field, restricted to flat / gently rolling ground
  // (never carved into hillsides, so no steep valleys the player can't leave)
  riverFreq: 0.00285,
  riverWidth: 0.150, // channel half-width in noise space (full-depth core)
  riverBankWidth: 0.11, // wide, gently shelving valley beyond the channel
  riverBedLevel: 1.2, // world height of the river floor (waterLevel is 3)
  riverBankLevel: 3.9, // walk-out bank shelf just above waterLevel
  riverMaxCarveHeight: 9, // rivers fade out where terrain is this far above water

  // Island / sea
  islandRadius: 430, // land extent (world half-width is 512)
  beachWidth: 55, // width of the beach/shallow slope crossing sea level
  seaFloorDepth: -4, // world height of the sea floor beyond the coast
  coastNoiseFreq: 0.006,
  coastNoiseAmp: 70, // world units of coastline irregularity (bays/headlands)
  // Beach dune relief — kills the dead-flat pancake shelf. Broad low swell +
  // faint cross-ripple, applied only on the sand shelf and faded at the
  // waterline so the wet flat stays smooth (BotW-style rolling sand).
  beachReliefAmp: 0.5, // world units of broad dune swell
  beachReliefFreq: 0.022, // low freq = wide gentle dunes
  beachRippleAmp: 0.08, // faint finer ripple on top
  beachRippleFreq: 0.13,
};

// ── Height-field generation ──────────────────────────────────────────────────

/**
 * Generate the full island height field.
 * @param {object} cfg   — DEFAULT_TERRAIN_PARAMS overrides (must include seed)
 * @param {number} width — world extent X
 * @param {number} depth — world extent Z
 * @param {number} maxHeight — world height at normalized elevation 1
 * @param {number} res   — field resolution (res × res samples)
 * @returns {{ data: Float32Array, res: number }}
 */
export function generateHeightField(cfg, width, depth, maxHeight, res = 1024, onProgress) {
  const p = { ...DEFAULT_TERRAIN_PARAMS, ...cfg };
  const seed = p.seed | 0;

  // Independent noise instances per layer so layers never correlate
  const nWarpX = createSimplex(seed);
  const nWarpZ = createSimplex(seed + 101);
  const nBase = createSimplex(seed + 202);
  const nHill = createSimplex(seed + 303);
  const nHighland = createSimplex(seed + 404);
  const nRidge = createSimplex(seed + 505);
  const nCliff = createSimplex(seed + 606);
  const nRamp = createSimplex(seed + 909);
  const nRiver = createSimplex(seed + 707);
  const nCoast = createSimplex(seed + 808);
  const nBeach = createSimplex(seed + 811);

  const fbm = (n, x, z, oct, freq) => {
    let v = 0,
      amp = 0.5,
      f = freq;
    for (let o = 0; o < oct; o++) {
      v += amp * n(x * f, z * f);
      f *= 2.02;
      amp *= 0.5;
    }
    return v; // ~[-1, 1] * 0.75
  };
  const fbm01 = (n, x, z, oct, freq) =>
    Math.min(1, Math.max(0, fbm(n, x, z, oct, freq) * 0.7 + 0.5));

  const data = new Float32Array(res * res);
  const waterLevel = p.waterLevel ?? 3.0; // tool addition: water.level is editable; game hardcodes 3.0

  // Seed-derived lake placement: centre offset, orientation and elongation.
  // Same seed → same lake; different seeds move/reshape it.
  const lakeRand = mulberry32(seed + 1213);
  const lakeOffA = lakeRand() * Math.PI * 2;
  const lakeOffR = Math.sqrt(lakeRand()) * (p.lakeOffsetMax ?? 0);
  const lakeCX = Math.cos(lakeOffA) * lakeOffR;
  const lakeCZ = Math.sin(lakeOffA) * lakeOffR;
  const lakeRot = lakeRand() * Math.PI;
  const lakeAspect =
    (p.lakeAspectMin ?? 1) +
    lakeRand() * ((p.lakeAspectMax ?? 1) - (p.lakeAspectMin ?? 1));
  const lakeCos = Math.cos(lakeRot);
  const lakeSin = Math.sin(lakeRot);

  for (let row = 0; row < res; row++) {
    if (onProgress && (row & 31) === 0) onProgress('height', row / res);
    const z = (row / (res - 1) - 0.5) * depth;
    for (let col = 0; col < res; col++) {
      const x = (col / (res - 1) - 0.5) * width;

      // 1. Domain warp
      const wx = x + p.warpAmp * fbm(nWarpX, x, z, 3, p.warpFreq);
      const wz = z + p.warpAmp * fbm(nWarpZ, x, z, 3, p.warpFreq);

      // 2. Lowland base — flat meadows with occasional broad swells
      const base = fbm01(nBase, wx, wz, 4, p.baseFreq);
      let e = p.baseFloor + p.baseAmp * Math.pow(base, p.baseFlatness ?? 1.8);

      // 3. Highland mask — macro composition: highland noise BLENDED with a
      // radial rim bias so mesas favour the outer ring of the island (cliffs
      // surrounding the meadows, Genshin/Mondstadt style) instead of clumping
      // on one side, and are fully suppressed inside the central meadow basin.
      const dCenter = Math.sqrt(x * x + z * z);
      const rimBias = smoothstep(p.rimBiasStart, p.rimBiasEnd, dCenter);

      // Elliptical distance to the seed-placed lake centre: rotate into the
      // lake frame, stretch the long axis back so iso-lines are ellipses.
      const lx = x - lakeCX;
      const lz = z - lakeCZ;
      const lu = (lx * lakeCos + lz * lakeSin) / lakeAspect;
      const lv = -lx * lakeSin + lz * lakeCos;
      const dLakeCenter = Math.sqrt(lu * lu + lv * lv);

      // Highland-free basin follows the lake, wherever the seed put it
      const basinCut = smoothstep(
        p.basinRadius * 0.6,
        p.basinRadius,
        dLakeCenter,
      );
      const hl = fbm01(nHighland, wx, wz, 3, p.highlandFreq);
      const hlComposite =
        hl * (1 - p.rimBiasWeight) + rimBias * p.rimBiasWeight;
      const m =
        smoothstep(
          p.highlandThreshold - p.highlandSoftness,
          p.highlandThreshold + p.highlandSoftness,
          hlComposite,
        ) * basinCut;

      // 4+5. Highland LIFT (rise above the meadow), terraced into mesa tiers.
      // The plateau field is a SMOOTH fbm pushed through gain() so tops read
      // as flat grassy mesas with steep sides (not ridged crests). Terracing
      // the lift — not the total elevation — keeps lowlands smooth and makes
      // plateaus step up in clean tiers from their base.
      if (m > 0.001) {
        const r = fbm01(nRidge, wx, wz, 4, p.ridgeFreq);
        const plateau = gain(r, p.plateauFlatness ?? 2.5);
        let lift = plateau * p.ridgeAmp;

        if (p.terraceSteps > 0) {
          const cliffN = fbm01(nCliff, wx, wz, 2, p.cliffBandFreq);
          const cliffMask = smoothstep(
            1 - p.cliffBandCoverage - 0.15,
            1 - p.cliffBandCoverage + 0.15,
            cliffN,
          );
          const k = 1 + (p.cliffSharpness - 1) * cliffMask;
          const t = (lift / p.ridgeAmp) * p.terraceSteps;
          lift =
            ((Math.floor(t) + gain(t - Math.floor(t), k)) / p.terraceSteps) *
            p.ridgeAmp;
        }

        // Ramp corridors — inside a corridor the lift blends back to the raw
        // smooth field (no gain flattening, no terraces, no cliff snap), so
        // the mesa side reads as a continuous walkable slope from base to top.
        const rampChan = Math.abs(fbm(nRamp, wx, wz, 2, p.rampFreq) * 0.7);
        const ramp =
          1 - smoothstep(p.rampWidth * 0.5, p.rampWidth, rampChan);
        if (ramp > 0.001) {
          const smoothLift = r * p.ridgeAmp;
          lift += (smoothLift - lift) * ramp;
        }

        e += m * lift;
      }

      // 6. Hill detail — gentle rolling texture everywhere
      e += p.hillAmp * fbm(nHill, wx, wz, 3, p.hillFreq);

      let h = Math.min(1.08, Math.max(0, e)) * maxHeight;

      // 7. River carve — connected branching channels through FLAT ground only.
      // Lowness gates the carve to terrain already near water level, so rivers
      // live on meadows / gently rolling ground and simply fade out where hills
      // rise — never gouging steep valleys the player can't climb out of.
      // Two-stage profile: the outer band shelves surrounding ground down to a
      // walkable riverBankLevel (just above waterLevel), then the core pulls
      // the channel floor to riverBedLevel. Banks stay shallow ramps.
      const rv = fbm(nRiver, wx, wz, 3, p.riverFreq) * 0.7;
      const dChan = Math.abs(rv);
      const valley =
        1 - smoothstep(0, p.riverWidth + p.riverBankWidth, dChan);
      if (valley > 0.001) {
        const core = 1 - smoothstep(0, p.riverWidth, dChan);
        const lowness =
          1 -
          smoothstep(
            p.riverMaxCarveHeight * 0.45,
            p.riverMaxCarveHeight,
            h - waterLevel,
          );
        if (h > p.riverBankLevel) {
          const bank = smoothstep(0, 1, valley); // eased shelf, no hard lip
          h += (p.riverBankLevel - h) * bank * lowness;
        }
        h += (p.riverBedLevel - h) * core * lowness;
      }

      // 8. Lake — shallow elliptical basin at the seed-placed centre with a
      // noise-perturbed shoreline. Full-depth core pulls to lakeBedLevel
      // (below waterLevel → visible water), shore band eases back to meadow.
      if (p.lakeRadius > 0) {
        const dLake =
          dLakeCenter +
          p.lakeEdgeNoiseAmp * fbm(nCoast, x + 913, z - 407, 3, p.coastNoiseFreq * 2);
        const lake =
          1 - smoothstep(p.lakeRadius, p.lakeRadius + p.lakeShoreWidth, dLake);
        if (lake > 0.001) h += (p.lakeBedLevel - h) * lake;
      }

      // 9. Island coast — a flat sand beach shelf just above sea level rings the
      // world, then the outer rim drops to the sea floor. The shelf gives palms
      // real flat ground instead of a straight slope into the water.
      const dist =
        Math.sqrt(x * x + z * z) +
        p.coastNoiseAmp * fbm(nCoast, x, z, 3, p.coastNoiseFreq);
      const beachLevel = waterLevel + 0.9; // flat shelf a touch above sea level
      // Ease the land down onto the beach shelf across the inner band…
      const tLand = smoothstep(
        p.islandRadius - p.beachWidth,
        p.islandRadius - p.beachWidth * 0.35,
        dist,
      );
      h = h + (beachLevel - h) * tLand;
      // …then drop the outer rim below sea level into the sea floor.
      const tSea = smoothstep(
        p.islandRadius - p.beachWidth * 0.3,
        p.islandRadius + p.beachWidth * 0.25,
        dist,
      );
      // Dune relief on the sand shelf: full inland, tapering to 0 at the
      // waterline so the wet flat stays smooth. shelfMask = on-shelf ∧ above-sea.
      const shelfMask = tLand * (1 - tSea);
      if (shelfMask > 0.001) {
        const dune =
          p.beachReliefAmp * fbm(nBeach, x, z, 3, p.beachReliefFreq) +
          p.beachRippleAmp * fbm(nBeach, x * 1.6 + 400, z * 1.6, 2, p.beachRippleFreq);
        h += dune * shelfMask;
      }
      h = h + (p.seaFloorDepth - h) * tSea;

      data[row * res + col] = h;
    }
  }

  onProgress?.('water', 0);
  ensureWaterConnectivity(data, res, width, depth, p, waterLevel, maxHeight);

  return { data, res };
}

// ── Water connectivity pass ──────────────────────────────────────────────────
// The river field is |fbm| bands gated by a "lowness" mask, so channels break
// into disconnected pools wherever the ground rises. This pass guarantees the
// boat can reach every water body: it flood-fills all NAVIGABLE water regions
// (deep enough for the boat), treats the sea (touching the field border) as
// the root network, and carves a low-cost channel from every isolated region
// to the network. Puddles too small to matter are drained (raised above water)
// instead of connected.

const NAV_DEPTH = 0.45; // min depth counted as boat-navigable (boat needs 0.35)
const MIN_POOL_CELLS = 400; // smaller isolated pools get drained, not connected
const CHANNEL_CORE = 5; // world units — full-depth channel half-width
const CHANNEL_BANK = 13; // world units — soft bank falloff half-width

function ensureWaterConnectivity(data, res, width, depth, p, waterLevel, maxHeight) {
  const cellW = width / (res - 1);

  // Round 1: join every sizable pool to the sea network
  connectPools(data, res, width, p, waterLevel, false);
  // Remove all dry pits/bowls (raises land only)
  fillDepressions(data, res);
  // Push all water beds to full depth (lowers underwater cells only). This
  // can promote shallow sub-navigable pockets into deep pools sitting behind
  // a still-shallow thread…
  deepenWaterBeds(data, res, cellW, waterLevel);
  // …so run a second connect round that joins EVERY remaining pool, however
  // small. Carving only lowers terrain along drained corridors, so this
  // cannot recreate pits, and no further deepening is needed (channel bed
  // 1.2 is already well past wading depth).
  connectPools(data, res, width, p, waterLevel, true);
}

function connectPools(data, res, width, p, waterLevel, connectAll) {
  const n = res * res;
  const navLevel = waterLevel - NAV_DEPTH;
  const bed = Math.min(p.riverBedLevel, navLevel - 0.5);
  const cellW = width / (res - 1);

  // 1. Label connected navigable-water components (4-neighbour BFS)
  const label = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  const compCells = []; // per-component cell lists
  const compTouchesBorder = [];

  for (let i = 0; i < n; i++) {
    if (label[i] !== -1 || data[i] > navLevel) continue;
    const id = compCells.length;
    const cells = [];
    let touchesBorder = false;
    let head = 0,
      tail = 0;
    queue[tail++] = i;
    label[i] = id;
    while (head < tail) {
      const c = queue[head++];
      cells.push(c);
      const row = (c / res) | 0;
      const col = c % res;
      if (row === 0 || col === 0 || row === res - 1 || col === res - 1)
        touchesBorder = true;
      if (col > 0 && label[c - 1] === -1 && data[c - 1] <= navLevel) {
        label[c - 1] = id;
        queue[tail++] = c - 1;
      }
      if (col < res - 1 && label[c + 1] === -1 && data[c + 1] <= navLevel) {
        label[c + 1] = id;
        queue[tail++] = c + 1;
      }
      if (row > 0 && label[c - res] === -1 && data[c - res] <= navLevel) {
        label[c - res] = id;
        queue[tail++] = c - res;
      }
      if (row < res - 1 && label[c + res] === -1 && data[c + res] <= navLevel) {
        label[c + res] = id;
        queue[tail++] = c + res;
      }
    }
    compCells.push(cells);
    compTouchesBorder.push(touchesBorder);
  }
  if (compCells.length <= 1) return;

  // 2. Root network = every border-touching component (the sea). Fallback:
  // largest component if the coast somehow never reaches the border.
  const connected = new Uint8Array(n);
  let haveSea = false;
  for (let id = 0; id < compCells.length; id++) {
    if (compTouchesBorder[id]) {
      haveSea = true;
      for (const c of compCells[id]) connected[c] = 1;
    }
  }
  const pending = [];
  for (let id = 0; id < compCells.length; id++) {
    if (compTouchesBorder[id]) continue;
    pending.push(id);
  }
  pending.sort((a, b) => compCells[b].length - compCells[a].length);
  if (!haveSea && pending.length) {
    const root = pending.shift();
    for (const c of compCells[root]) connected[c] = 1;
  }

  // 3. ONE multi-source Dijkstra outward from the whole connected network.
  // Step cost punishes height above water quadratically, so cheapest paths
  // hug the lowest ground (meadows, existing dry riverbeds) and only cut
  // through hills when there is no alternative. Every pool then connects by
  // backtracking its cheapest cell to the network — no per-pool searches.
  const dist = new Float32Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const heap = new Int32Array(n + 1);
  let heapSize = 0;
  const push = (c) => {
    let k = ++heapSize;
    heap[k] = c;
    while (k > 1) {
      const pk = k >> 1;
      if (dist[heap[pk]] <= dist[heap[k]]) break;
      const t = heap[pk];
      heap[pk] = heap[k];
      heap[k] = t;
      k = pk;
    }
  };
  const pop = () => {
    const top = heap[1];
    heap[1] = heap[heapSize--];
    let k = 1;
    for (;;) {
      let s = k;
      const l = k * 2,
        r = l + 1;
      if (l <= heapSize && dist[heap[l]] < dist[heap[s]]) s = l;
      if (r <= heapSize && dist[heap[r]] < dist[heap[s]]) s = r;
      if (s === k) break;
      const t = heap[s];
      heap[s] = heap[k];
      heap[k] = t;
      k = s;
    }
    return top;
  };

  for (let c = 0; c < n; c++) {
    if (connected[c]) {
      dist[c] = 0;
      push(c);
    }
  }
  const settled = new Uint8Array(n);
  while (heapSize > 0) {
    const c = pop();
    if (settled[c]) continue;
    settled[c] = 1;
    const d = dist[c];
    const row = (c / res) | 0;
    const col = c % res;
    for (let dir = 0; dir < 4; dir++) {
      if (dir === 0 && col === 0) continue;
      if (dir === 1 && col === res - 1) continue;
      if (dir === 2 && row === 0) continue;
      if (dir === 3 && row === res - 1) continue;
      const nc =
        dir === 0 ? c - 1 : dir === 1 ? c + 1 : dir === 2 ? c - res : c + res;
      if (settled[nc]) continue;
      const above = Math.max(0, data[nc] - navLevel);
      const nd = d + 1 + above * above * 4;
      if (nd < dist[nc]) {
        dist[nc] = nd;
        prev[nc] = c;
        push(nc);
      }
    }
  }

  // 4. Connect (or drain) each isolated pool, largest first
  const coreCells = Math.max(1, Math.round(CHANNEL_CORE / cellW));
  const bankCells = Math.max(coreCells + 1, Math.round(CHANNEL_BANK / cellW));

  for (const id of pending) {
    const cells = compCells[id];

    if (!connectAll && cells.length < MIN_POOL_CELLS) continue; // handled later

    let start = -1,
      best = Infinity;
    for (const c of cells) {
      if (dist[c] < best) {
        best = dist[c];
        start = c;
      }
    }
    if (start === -1) continue; // unreachable — should not happen

    // Carve the channel back to the network: flat bed core, smooth bank blend
    for (let c = start; c !== -1; c = prev[c]) {
      const row = (c / res) | 0;
      const col = c % res;
      for (let dr = -bankCells; dr <= bankCells; dr++) {
        const rr = row + dr;
        if (rr < 0 || rr >= res) continue;
        for (let dc = -bankCells; dc <= bankCells; dc++) {
          const cc = col + dc;
          if (cc < 0 || cc >= res) continue;
          const dd = Math.sqrt(dr * dr + dc * dc);
          if (dd > bankCells) continue;
          const k = rr * res + cc;
          const t = 1 - smoothstep(coreCells, bankCells, dd);
          const target = data[k] + (bed - data[k]) * t;
          if (target < data[k]) data[k] = target;
        }
      }
      if (dist[c] === 0) break; // reached the network
    }
  }

}

// Deepen all water beds to a fixed profile: terrain below waterLevel is
// clamped to a depth curve driven by chamfer distance from the shoreline —
// shore ramp eases from the waterline down, interior clamps to WATER_BED_LEVEL
// (0). Only ever lowers terrain (sea floor at -4 stays), so it cannot break
// connectivity or create walkable shallows inside water bodies.
const WATER_BED_LEVEL = 0;
const SHORE_RAMP_WIDTH = 7; // world units from shoreline to full bed depth

function deepenWaterBeds(data, res, cellW, waterLevel) {
  const n = res * res;
  const INF = 1e9;
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = data[i] >= waterLevel ? 0 : INF;

  // Two-pass chamfer distance transform (weights 1 / √2, per-cell)
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

  const rampCells = SHORE_RAMP_WIDTH / cellW;
  for (let i = 0; i < n; i++) {
    if (d[i] === 0) continue; // land
    const t = smoothstep(0, rampCells, d[i]);
    const target = waterLevel + (WATER_BED_LEVEL - waterLevel) * t;
    if (data[i] > target) data[i] = target;
  }
}

// Priority-flood epsilon fill (Barnes 2014). Processes cells from the map
// border inward in order of fill level; a cell's fill level is the highest
// point on the lowest path connecting it to the border. Cells below that
// level sit in a depression and are raised to it, plus a tiny per-cell
// epsilon so filled areas still drain instead of forming dead-flat pans.
function fillDepressions(data, res) {
  const n = res * res;
  const EPS = 0.001;
  const lvl = new Float32Array(n);
  const closed = new Uint8Array(n);
  const heap = new Int32Array(n + 1);
  let heapSize = 0;

  const push = (c) => {
    let k = ++heapSize;
    heap[k] = c;
    while (k > 1) {
      const pk = k >> 1;
      if (lvl[heap[pk]] <= lvl[heap[k]]) break;
      const t = heap[pk];
      heap[pk] = heap[k];
      heap[k] = t;
      k = pk;
    }
  };
  const pop = () => {
    const top = heap[1];
    heap[1] = heap[heapSize--];
    let k = 1;
    for (;;) {
      let s = k;
      const l = k * 2,
        r = l + 1;
      if (l <= heapSize && lvl[heap[l]] < lvl[heap[s]]) s = l;
      if (r <= heapSize && lvl[heap[r]] < lvl[heap[s]]) s = r;
      if (s === k) break;
      const t = heap[s];
      heap[s] = heap[k];
      heap[k] = t;
      k = s;
    }
    return top;
  };

  for (let col = 0; col < res; col++) {
    for (const c of [col, (res - 1) * res + col]) {
      if (!closed[c]) {
        closed[c] = 1;
        lvl[c] = data[c];
        push(c);
      }
    }
  }
  for (let row = 1; row < res - 1; row++) {
    for (const c of [row * res, row * res + res - 1]) {
      if (!closed[c]) {
        closed[c] = 1;
        lvl[c] = data[c];
        push(c);
      }
    }
  }

  while (heapSize > 0) {
    const c = pop();
    const row = (c / res) | 0;
    const col = c % res;
    for (let dir = 0; dir < 4; dir++) {
      if (dir === 0 && col === 0) continue;
      if (dir === 1 && col === res - 1) continue;
      if (dir === 2 && row === 0) continue;
      if (dir === 3 && row === res - 1) continue;
      const nc =
        dir === 0 ? c - 1 : dir === 1 ? c + 1 : dir === 2 ? c - res : c + res;
      if (closed[nc]) continue;
      closed[nc] = 1;
      const fill = lvl[c] + EPS;
      lvl[nc] = Math.max(data[nc], fill);
      if (data[nc] < fill) data[nc] = fill;
      push(nc);
    }
  }
}
