import { generateHeightField } from './terrainNoise.js';
import { shoreDistance } from './shore.js';
import { createHeightSampler } from './sampler.js';
import { forestSuitability } from './forest.js';
import { beachMask } from './beach.js';
import { NATIVE_RES } from './defaults.js';

// Stage weights for a single 0..1 progress bar.
const STAGES = { height: [0, 0.55], water: [0.55, 0.75], shore: [0.75, 0.82], beach: [0.82, 0.92], forest: [0.92, 1] };

export function generateMaps(cfg, onProgress = () => {}) {
  const res = NATIVE_RES;
  const { width, depth, maxHeight, segments } = cfg.terrain;
  const waterLevel = cfg.water.level;
  const step = (stage, t = 0) => {
    const [a, b] = STAGES[stage];
    onProgress(stage, a + (b - a) * t);
  };

  const params = { ...cfg.procedural, waterLevel };
  const { data: height } = generateHeightField(params, width, depth, maxHeight, res, step);
  step('shore');
  const shore = shoreDistance(height, res, width, waterLevel);
  const heightAt = createHeightSampler(height, res, width, depth, segments);
  step('beach');
  const beach = beachMask(cfg.procedural, heightAt, waterLevel, width, depth, res);
  step('forest');
  const forest = forestSuitability(cfg.forest, heightAt, waterLevel, width, depth, res);
  onProgress('done', 1);

  let min = Infinity, max = -Infinity;
  for (let i = 0; i < height.length; i++) {
    const h = height[i];
    if (h < min) min = h;
    if (h > max) max = h;
  }
  return { res, height, shore, beach, forest, stats: { min, max } };
}
