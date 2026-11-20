import { DEFAULTS, clone } from './defaults.js';

// Starting points. Each is a partial override of DEFAULTS; seeds pick a nice layout.
const LIST = [
  { id: 'island', name: 'Island', desc: 'Meadow interior, mesas ringing the coast, carved rivers.', over: {} },
  {
    id: 'archipelago', name: 'Archipelago', desc: 'Broken coastline, wide channels between landmasses.',
    over: { procedural: { seed: 4242, islandRadius: 470, coastNoiseAmp: 170, coastNoiseFreq: 0.009, beachWidth: 40, riverFreq: 0.004, riverWidth: 0.17, riverBankWidth: 0.2, ridgeAmp: 0.4 } },
  },
  {
    id: 'continent', name: 'Continent', desc: 'Land runs off the map edge; big terraced uplands.',
    over: { procedural: { seed: 808, islandRadius: 760, coastNoiseAmp: 60, ridgeAmp: 0.75, terraceSteps: 3, highlandThreshold: 0.5, rimBiasWeight: 0 } },
  },
  {
    id: 'highlands', name: 'Highlands', desc: 'Tall stepped plateaus and sheer cliffs.',
    over: { terrain: { maxHeight: 45 }, procedural: { seed: 2024, highlandThreshold: 0.42, ridgeAmp: 0.9, terraceSteps: 4, cliffBandCoverage: 0.85, basinRadius: 60 } },
  },
  {
    id: 'lake', name: 'Lake basin', desc: 'Central elliptical lake in a wide meadow basin.',
    over: { procedural: { seed: 31, lakeRadius: 75, lakeShoreWidth: 50, lakeOffsetMax: 60, basinRadius: 190, riverWidth: 0.07 } },
  },
  {
    id: 'plains', name: 'Rolling plains', desc: 'Gentle hills, no terraces, lazy rivers.',
    over: { procedural: { seed: 77, ridgeAmp: 0.15, terraceSteps: 0, highlandThreshold: 0.72, hillAmp: 0.05, baseAmp: 0.26, riverWidth: 0.12 } },
  },
];

function deepMerge(base, over) {
  for (const [k, v] of Object.entries(over)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) deepMerge(base[k], v);
    else base[k] = v;
  }
  return base;
}

export const PRESETS = LIST.map((p) => ({ ...p, cfg: () => deepMerge(clone(DEFAULTS), p.over) }));
