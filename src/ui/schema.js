// Parameter groups for the sidebar. path = dot path into the config object.
const P = (key, label, min, max, step, tip) => ({ path: `procedural.${key}`, label, min, max, step, tip });

export const GROUPS = [
  {
    id: 'world', title: 'World',
    params: [
      { path: 'terrain.maxHeight', label: 'Max height', min: 5, max: 120, step: 1, tip: 'World height (m) at normalized elevation 1. Scales all relief.' },
      { path: 'terrain.width', label: 'World width', min: 256, max: 4096, step: 64, tip: 'World extent along X (m). Samples stay 1024 across.' },
      { path: 'terrain.depth', label: 'World depth', min: 256, max: 4096, step: 64, tip: 'World extent along Z (m).' },
      { path: 'water.level', label: 'Water level', min: 0, max: 10, step: 0.1, tip: 'Sea / river surface height (m). Drives carving, connectivity and every mask.' },
    ],
  },
  {
    id: 'warp', title: 'Domain warp',
    params: [
      P('warpFreq', 'Frequency', 0.0005, 0.02, 0.0001, 'Frequency of the coordinate warp that bends every downstream pattern.'),
      P('warpAmp', 'Amplitude', 0, 120, 1, 'World units of coordinate displacement. Higher = swirlier, less grid-like.'),
    ],
  },
  {
    id: 'lowlands', title: 'Lowlands',
    params: [
      P('baseFreq', 'Base frequency', 0.0005, 0.01, 0.0001, 'Frequency of the continental base: broad meadow swells.'),
      P('baseFloor', 'Base floor', 0, 0.5, 0.005, 'Minimum normalized elevation of dry lowlands.'),
      P('baseAmp', 'Base amplitude', 0, 0.6, 0.005, 'How high the broad lowland swells rise above the floor.'),
      P('baseFlatness', 'Flatness', 0.5, 5, 0.05, 'Power applied to the base: higher compresses lows so wide areas sit flat.'),
      P('hillFreq', 'Hill frequency', 0.002, 0.05, 0.0005, 'Frequency of small rolling hill detail layered everywhere.'),
      P('hillAmp', 'Hill amplitude', 0, 0.15, 0.002, 'Strength of the small hill detail.'),
    ],
  },
  {
    id: 'composition', title: 'Composition',
    params: [
      P('basinRadius', 'Basin radius', 0, 400, 1, 'Highland-free meadow zone around the lake centre (m).'),
      P('rimBiasStart', 'Rim bias start', 0, 600, 1, 'Distance from centre where highlands start being favoured.'),
      P('rimBiasEnd', 'Rim bias end', 0, 700, 1, 'Distance where the rim bias reaches full strength.'),
      P('rimBiasWeight', 'Rim bias weight', 0, 1, 0.01, 'How strongly mesas favour the outer ring vs. pure noise.'),
    ],
  },
  {
    id: 'lake', title: 'Lake',
    params: [
      P('lakeRadius', 'Radius', 0, 200, 1, 'Full-depth core radius (m). 0 disables the lake.'),
      P('lakeShoreWidth', 'Shore width', 0, 150, 1, 'Soft slope band from lake bed back to meadow level.'),
      P('lakeBedLevel', 'Bed level', -4, 5, 0.1, 'World height of the lake floor.'),
      P('lakeEdgeNoiseAmp', 'Edge noise', 0, 80, 1, 'World units of shoreline irregularity.'),
      P('lakeOffsetMax', 'Max offset', 0, 300, 1, 'Max seed-driven displacement of the lake centre from map centre.'),
      P('lakeAspectMin', 'Aspect min', 1, 3, 0.01, 'Min long/short axis ratio of the elliptical basin.'),
      P('lakeAspectMax', 'Aspect max', 1, 3, 0.01, 'Max long/short axis ratio.'),
    ],
  },
  {
    id: 'highlands', title: 'Highlands',
    params: [
      P('highlandFreq', 'Frequency', 0.0005, 0.02, 0.0001, 'Frequency of the discrete mesa-region mask.'),
      P('highlandThreshold', 'Threshold', 0, 1, 0.01, 'Mask cut-off: higher = fewer, smaller highland zones.'),
      P('highlandSoftness', 'Softness', 0.005, 0.5, 0.005, 'Width of the highland mask transition.'),
      P('ridgeFreq', 'Plateau frequency', 0.0005, 0.02, 0.0001, 'Frequency of the plateau relief inside highlands.'),
      P('ridgeAmp', 'Plateau amplitude', 0, 1.5, 0.01, 'Mesa/plateau strength inside highland zones.'),
      P('plateauFlatness', 'Plateau flatness', 1, 8, 0.05, 'Gain on the plateau field: higher = flatter tops, steeper sides.'),
    ],
  },
  {
    id: 'terraces', title: 'Terraces & cliffs',
    params: [
      P('terraceSteps', 'Terrace steps', 0, 8, 1, 'Mesa tiers within the highland lift. 0 disables terracing.'),
      P('cliffSharpness', 'Cliff sharpness', 1, 16, 0.1, 'How vertical terrace edges snap (1 = smooth ramp).'),
      P('cliffBandFreq', 'Cliff band freq', 0.002, 0.08, 0.001, 'Noise deciding cliff vs. ramp along a plateau edge.'),
      P('cliffBandCoverage', 'Cliff coverage', 0, 1, 0.01, 'Fraction of plateau edge that is sheer cliff.'),
      P('rampFreq', 'Ramp frequency', 0.001, 0.03, 0.0005, 'Frequency of the walkable ramp corridors up the mesas.'),
      P('rampWidth', 'Ramp width', 0, 0.4, 0.005, 'Corridor half-width in noise space.'),
    ],
  },
  {
    id: 'rivers', title: 'Rivers',
    params: [
      P('riverFreq', 'Frequency', 0.0005, 0.01, 0.00005, 'Frequency of the |fbm| river channel field.'),
      P('riverWidth', 'Channel width', 0, 0.4, 0.005, 'Channel half-width in noise space (full-depth core).'),
      P('riverBankWidth', 'Bank width', 0, 0.4, 0.005, 'Gently shelving valley beyond the channel.'),
      P('riverBedLevel', 'Bed level', -4, 5, 0.1, 'World height of the river floor.'),
      P('riverBankLevel', 'Bank level', 0, 10, 0.1, 'Walk-out bank shelf just above water.'),
      P('riverMaxCarveHeight', 'Max carve height', 0, 30, 0.5, 'Rivers fade out where terrain is this far above water.'),
    ],
  },
  {
    id: 'coast', title: 'Coast & sea',
    params: [
      P('islandRadius', 'Island radius', 100, 1000, 1, 'Land extent from the centre (m).'),
      P('seaFloorDepth', 'Sea floor', -20, 0, 0.1, 'World height of the sea floor beyond the coast.'),
      P('coastNoiseFreq', 'Coast noise freq', 0.001, 0.03, 0.0005, 'Frequency of coastline irregularity (also drives lake edge).'),
      P('coastNoiseAmp', 'Coast noise amp', 0, 200, 1, 'World units of bays and headlands.'),
    ],
  },
  {
    id: 'beach', title: 'Beach',
    params: [
      P('beachWidth', 'Beach width', 0, 150, 1, 'Radial width of the flat walkable sand shelf.'),
      P('beachSandHeight', 'Sand height', 0.5, 5, 0.05, 'How high above water the sand climbs (beach mask / sand colour). No height change.'),
      P('beachGrassCut', 'Grass cut', 0.05, 0.6, 0.01, 'Threshold on the beach mask where grass would be cleared. Shown as bright sand in the Beach layer.'),
      P('beachReliefAmp', 'Dune amplitude', 0, 3, 0.01, 'World units of broad dune swell on the sand shelf.'),
      P('beachReliefFreq', 'Dune frequency', 0.002, 0.1, 0.001, 'Low = wide gentle dunes.'),
      P('beachRippleAmp', 'Ripple amplitude', 0, 0.5, 0.005, 'Faint finer ripple on top of the dunes.'),
      P('beachRippleFreq', 'Ripple frequency', 0.01, 0.5, 0.005, 'Frequency of the fine ripple.'),
    ],
  },
  {
    id: 'forest', title: 'Forest',
    params: [
      { path: 'forest.seed', label: 'Seed', min: 0, max: 9999, step: 1, tip: 'Seed for the grove / clearing noise.' },
      { path: 'forest.forestZoneScale', label: 'Grove scale', min: 0.001, max: 0.05, step: 0.0005, tip: 'Frequency of the grove/clearing noise.' },
      { path: 'forest.forestZoneThreshold', label: 'Grove threshold', min: 0, max: 1, step: 0.01, tip: 'Lower = more forest, fewer meadow clearings.' },
      { path: 'forest.groveContrast', label: 'Grove contrast', min: 0.01, max: 0.5, step: 0.01, tip: 'Half-width of the grove/clearing fade band.' },
      { path: 'forest.moistureRange', label: 'Moisture range', min: 1, max: 60, step: 0.5, tip: 'Height above water where lushness fades to dry.' },
      { path: 'forest.lowlandBias', label: 'Lowland bias', min: 0, max: 1, step: 0.01, tip: '0 = trees only hug water, 1 = ignore moisture.' },
      { path: 'forest.treelineStart', label: 'Treeline start', min: 0, max: 60, step: 0.5, tip: 'Full forest strength up to this world height.' },
      { path: 'forest.treelineHeight', label: 'Treeline end', min: 0, max: 80, step: 0.5, tip: 'Fully bare (peaks) by this world height.' },
    ],
  },
];

export const getPath = (o, path) => path.split('.').reduce((a, k) => a?.[k], o);
export function setPath(o, path, v) {
  const ks = path.split('.');
  const last = ks.pop();
  ks.reduce((a, k) => a[k], o)[last] = v;
}
