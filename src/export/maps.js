// Exportable maps. `value` maps a sample to 0..1 for 8/16-bit images.
export const MAPS = {
  height: { label: 'Height', formats: ['bin', 'png16', 'png', 'jpg', 'webp'] },
  water: { label: 'Water mask', formats: ['bin', 'png', 'jpg', 'webp'] },
  shore: { label: 'Shore distance', formats: ['bin', 'png', 'jpg', 'webp'] },
  beach: { label: 'Beach mask', formats: ['bin', 'png', 'jpg', 'webp'] },
  forest: { label: 'Forest suitability', formats: ['bin', 'png', 'jpg', 'webp'] },
};

export const FORMATS = {
  bin: { label: 'Raw Float32 .bin', ext: 'bin', lossless: true },
  png16: { label: 'PNG 16-bit', ext: 'png', lossless: true },
  png: { label: 'PNG 8-bit', ext: 'png', lossless: true },
  jpg: { label: 'JPG', ext: 'jpg', lossy: true },
  webp: { label: 'WebP', ext: 'webp', lossy: true },
};

export const RESOLUTIONS = [128, 256, 512, 1024, 2048, 4096, 8192];

// Source field + how to turn a sample into 0..1 / RGB.
export function mapSource(key, maps, cfg) {
  const { stats } = maps;
  const lvl = cfg.water.level;
  const span = stats.max - stats.min || 1;
  switch (key) {
    case 'height':
      return { field: maps.height, unit: (v) => (v - stats.min) / span };
    case 'water':
      return { field: maps.height, unit: (v) => (v < lvl ? 1 : 0), binType: 'u8' };
    case 'shore':
      return { field: maps.shore, unit: (v) => v / 100 };
    case 'beach':
      return { field: maps.beach, unit: (v) => v };
    case 'forest':
      return { field: maps.forest, unit: (v) => v };
  }
}
