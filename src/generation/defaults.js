// Default config (the "Island" preset): DEFAULT_TERRAIN_PARAMS overlaid with the overrides below.
import { DEFAULT_TERRAIN_PARAMS } from './terrainNoise.js';

const ISLAND = {
  seed: 9001,
  islandRadius: 450,
  beachWidth: 55,
  beachSandHeight: 1.8,
  beachGrassCut: 0.25,
  seaFloorDepth: -4,
  ridgeAmp: 0.55,
  terraceSteps: 2,
  cliffSharpness: 6.0,
  cliffBandCoverage: 0.65,
  lakeRadius: 0,
  riverWidth: 0.1,
  riverBankWidth: 0.16,
  riverBedLevel: 1.2,
};

export const DEFAULTS = {
  terrain: { width: 1024, depth: 1024, maxHeight: 30, segments: 1024 },
  procedural: { ...DEFAULT_TERRAIN_PARAMS, ...ISLAND },
  water: { level: 3.0 },
  // forest-suitability knobs
  forest: {
    seed: 134,
    forestZoneScale: 0.012,
    forestZoneThreshold: 0.44,
    groveContrast: 0.2,
    moistureRange: 16,
    lowlandBias: 0.5,
    treelineStart: 16,
    treelineHeight: 27,
  },
};

export const NATIVE_RES = 1024;

export const clone = (o) => JSON.parse(JSON.stringify(o));
