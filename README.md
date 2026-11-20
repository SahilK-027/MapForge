# MapForge

> I couldn't find good heightmaps for my game **Remnance**, so I built MapForge with Claude.
> It's a procedural terrain tool, and it's what generated my game's map.

Tweak any parameter, preview the terrain in 2D or 3D, and export height and mask maps
from 128 px up to 8K. Start from a preset (Island, Archipelago, Continent, Highlands,
Lake basin, Rolling plains) or roll a random seed.

```bash
npm install
npm run dev      # editor at http://localhost:5173
npm run bake -- my-preset.json   # native maps (+ JSON metadata) for a saved preset → ./baked
```

### Exactness check (game developers)

The generator is a port of the game's terrain code. Given the same config, native 1024²
output is **bit-identical** to what the game computes, so a game can load baked data
instead of generating at boot.

```bash
GAME_SRC=/path/to/game/src npm run verify -- --write-preset private/game.json
```

`verify` bundles the game's original `TerrainGenerator` (engine singletons stubbed), reads the
game's own config at run time, runs both, and asserts 0 differing values for height and shore
distance. The game's config is never stored in this repo; `--write-preset` saves it to a
gitignored file you can `bake` or import into the editor.

## Maps

| Map | Origin | Exact |
| --- | --- | --- |
| Height (Float32, world metres) | `TerrainNoise.generateHeightField` incl. water connectivity passes | ✓ verified |
| Shore distance (m, ≤100) | `TerrainGenerator._generateShoreDistField` | ✓ verified |
| Water mask | `height < water.level` | derived |
| Beach mask | `Trees` outer-coast `beachFactor` (ported, uses the game's mesh-surface `getHeightAt`) | ported, not verified |
| Forest suitability | `Trees` `forestSuitability` | ported, not verified |

Not ported: actual tree instance placement and `_bakeForestCover` (needs species configs,
shrine exclusion, the GPU grass mask and the full 700-line placement pass).

## Export

Resolutions 128 → 8K. Native 1K raw `.bin` = exact game bytes (Float32 little-endian, row-major,
row 0 at z = −depth/2). Other sizes are resampled (Lanczos3 down, Catmull-Rom up) and marked
`_resampled`. PNG 16-bit for height, 8-bit PNG / JPG / WebP for everything (JPG/WebP are lossy).
Large outputs are produced in strips in a worker; PNGs are streamed through a zlib encoder.

## Layout

```
src/generation/  terrainNoise (verbatim port), shore, beach, forest, sampler, generate, worker
src/preview/     2D map (layers, pan/zoom, probe), 3D three.js view
src/export/      resampler, streaming PNG encoder, encoders, export worker
src/ui/          parameter schema + tooltips, sidebar, export panel
scripts/         verify.mjs, bake.mjs
```

Shortcuts: `R` regenerate · `E` export · `D` random seed · `V` 2D/3D · `1`–`6` layers.

## License

MIT, see [LICENSE](LICENSE).
