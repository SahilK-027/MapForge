// Sidecar metadata for raw exports. Layout: row-major, row 0 at z = -depth/2,
// col 0 at x = -width/2, sample (col,row) at world ((col/(res-1) - .5)*width, …).
export function buildMeta(map, res, cfg, stats, exact, extra = {}) {
  return {
    map,
    format: 'float32-le',
    width: res,
    height: res,
    exact,
    resampled: !exact,
    worldSize: { x: cfg.terrain.width, z: cfg.terrain.depth },
    maxHeight: cfg.terrain.maxHeight,
    waterLevel: cfg.water.level,
    min: stats?.min,
    max: stats?.max,
    layout: 'row-major; row 0 = z -depth/2; col 0 = x -width/2; corner-aligned samples',
    generator: 'MapForge',
    ...extra,
    config: cfg,
  };
}
