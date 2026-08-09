import type { Pt, TableBounds } from '../types';

/** Rescales a fixed point cloud (e.g. loaded from a static .gcode file, not
 * generated fresh) to fit the given table, preserving aspect ratio.
 * Mirrors the Rust side's `fit_to_table` in src/gcode.rs. */
export function fitPointsToTable(rawPts: Pt[], table: TableBounds, marginFrac = 0.03): Pt[] {
  if (!rawPts.length) return [];
  let minx = Infinity;
  let maxx = -Infinity;
  let miny = Infinity;
  let maxy = -Infinity;
  for (const p of rawPts) {
    if (p.x < minx) minx = p.x;
    if (p.x > maxx) maxx = p.x;
    if (p.y < miny) miny = p.y;
    if (p.y > maxy) maxy = p.y;
  }
  const srcW = Math.max(maxx - minx, 1e-9);
  const srcH = Math.max(maxy - miny, 1e-9);
  const availW = table.w * (1 - marginFrac * 2);
  const availH = table.h * (1 - marginFrac * 2);
  const scale = Math.min(availW / srcW, availH / srcH);
  const cx = (minx + maxx) / 2;
  const cy = (miny + maxy) / 2;
  return rawPts.map((p) => ({
    x: table.cx + (p.x - cx) * scale,
    y: table.cy + (p.y - cy) * scale,
  }));
}
