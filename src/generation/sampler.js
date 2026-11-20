// Port of TerrainGenerator.getHeightAt: the mesh-surface height (segments grid,
// diagonal b–c triangulation) that physics/spawners should query.
export function createHeightSampler(heights, res, width, depth, segments) {
  const baked = (x, z) => {
    const u = (x / width + 0.5) * (res - 1);
    const v = (z / depth + 0.5) * (res - 1);
    const u0 = Math.max(0, Math.min(res - 2, Math.floor(u)));
    const v0 = Math.max(0, Math.min(res - 2, Math.floor(v)));
    const u1 = u0 + 1;
    const v1 = v0 + 1;
    const fu = u - u0;
    const fv = v - v0;
    const h00 = heights[v0 * res + u0];
    const h10 = heights[v0 * res + u1];
    const h01 = heights[v1 * res + u0];
    const h11 = heights[v1 * res + u1];
    return (h00 * (1 - fu) + h10 * fu) * (1 - fv) + (h01 * (1 - fu) + h11 * fu) * fv;
  };
  const vert = (col, row) => baked((col / segments - 0.5) * width, (row / segments - 0.5) * depth);

  return function heightAt(x, z) {
    const gu = (x / width + 0.5) * segments;
    const gv = (z / depth + 0.5) * segments;
    const c0 = Math.max(0, Math.min(segments - 1, Math.floor(gu)));
    const r0 = Math.max(0, Math.min(segments - 1, Math.floor(gv)));
    const fu = Math.max(0, Math.min(1, gu - c0));
    const fv = Math.max(0, Math.min(1, gv - r0));
    const hA = vert(c0, r0);
    const hB = vert(c0 + 1, r0);
    const hC = vert(c0, r0 + 1);
    const hD = vert(c0 + 1, r0 + 1);
    if (fu + fv <= 1) return hA + (hB - hA) * fu + (hC - hA) * fv;
    return hD + (hB - hD) * (1 - fv) + (hC - hD) * (1 - fu);
  };
}
