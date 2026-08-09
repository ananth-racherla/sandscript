import type { Pt, TableBounds } from '../types';
import { parseGcode, ptsToGcode } from '../gcode';

// GRBL always moves in a straight line from wherever the ball currently is
// to the first coordinate of a new job. Left alone, that draws an arbitrary
// chord straight across whatever's already on the table. The only thing
// that tells us where the ball actually ended up is our own last-sent
// pattern's final point, so callers track that (see octoprintStore) and
// pass it in here — this module stays pure and doesn't touch storage.

export function nearestBoundaryPoint(p: Pt, table: TableBounds): Pt {
  const dLeft = p.x - table.xMin;
  const dRight = table.xMax - p.x;
  const dBottom = p.y - table.yMin;
  const dTop = table.yMax - p.y;
  const m = Math.min(dLeft, dRight, dBottom, dTop);
  if (m === dLeft) return { x: table.xMin, y: p.y };
  if (m === dRight) return { x: table.xMax, y: p.y };
  if (m === dBottom) return { x: p.x, y: table.yMin };
  return { x: p.x, y: table.yMax };
}

/** Parametrize the rectangle's perimeter as a single looped distance,
 * clockwise starting at the bottom-left corner along the bottom edge. */
export function perimeterParam(p: Pt, table: TableBounds): number {
  const { xMin, xMax, yMin, yMax } = table;
  const w = xMax - xMin;
  const h = yMax - yMin;
  const eps = 1e-6;
  if (Math.abs(p.y - yMin) < eps) return p.x - xMin;
  if (Math.abs(p.x - xMax) < eps) return w + (p.y - yMin);
  if (Math.abs(p.y - yMax) < eps) return w + h + (xMax - p.x);
  return w + h + w + (yMax - p.y);
}

export function pointAtPerimeterParam(t: number, table: TableBounds): Pt {
  const { xMin, xMax, yMin, yMax } = table;
  const w = xMax - xMin;
  const h = yMax - yMin;
  const peri = 2 * (w + h);
  let tt = ((t % peri) + peri) % peri;
  if (tt <= w) return { x: xMin + tt, y: yMin };
  tt -= w;
  if (tt <= h) return { x: xMax, y: yMin + tt };
  tt -= h;
  if (tt <= w) return { x: xMax - tt, y: yMax };
  tt -= w;
  return { x: xMin, y: yMax - tt };
}

/** Walk the shorter way around the perimeter from `from` to `to`, including
 * any corners crossed along the way so the path stays exactly on the edge. */
export function tracePerimeter(from: Pt, to: Pt, table: TableBounds): Pt[] {
  const { xMin, xMax, yMin, yMax } = table;
  const w = xMax - xMin;
  const h = yMax - yMin;
  const peri = 2 * (w + h);
  const corners = [0, w, w + h, w + h + w];
  const t0 = perimeterParam(from, table);
  let d = perimeterParam(to, table) - t0;
  while (d > peri / 2) d -= peri;
  while (d < -peri / 2) d += peri;
  const t1 = t0 + d;

  // Unwrap each corner to the copy nearest t0 in the direction of travel,
  // keep only those strictly between t0 and t1, then sort by traversal
  // order — the direction of the raw `corners` list doesn't matter here.
  const crossed: number[] = [];
  for (const c of corners) {
    let cc = c;
    if (d >= 0) {
      while (cc <= t0) cc += peri;
      if (cc < t1) crossed.push(cc);
    } else {
      while (cc >= t0) cc -= peri;
      if (cc > t1) crossed.push(cc);
    }
  }
  crossed.sort((a, b) => (d >= 0 ? a - b : b - a));
  const pts = crossed.map((t) => pointAtPerimeterParam(t, table));
  pts.push(pointAtPerimeterParam(t1, table));
  return pts;
}

export interface LeadInResult {
  gcode: string;
  newEndPoint: Pt;
}

/** Prepends a boundary-hugging approach path from `lastEndPoint` (if any)
 * to the pattern's own first point, and returns the pattern's true final
 * point so the caller can persist it for next time. Pure — does not read
 * or write storage itself. */
export function withBoundaryLeadIn(gcode: string, name: string, table: TableBounds, lastEndPoint: Pt | null): LeadInResult {
  const patternPts = parseGcode(gcode);
  if (!patternPts.length) return { gcode, newEndPoint: { x: table.cx, y: table.cy } };

  let allPts = patternPts;
  if (lastEndPoint) {
    const entry = nearestBoundaryPoint(lastEndPoint, table);
    const exit = nearestBoundaryPoint(patternPts[0], table);
    allPts = [entry, ...tracePerimeter(entry, exit, table), ...patternPts];
    // Adjacent boundary/corner points can coincide (e.g. entry and exit
    // land on the same edge point) — drop the resulting no-op duplicates.
    allPts = allPts.filter((p, i) => i === 0 || Math.hypot(p.x - allPts[i - 1].x, p.y - allPts[i - 1].y) > 1e-6);
  }

  const newEndPoint = patternPts[patternPts.length - 1];
  const cleanName = name.replace(/\.gcode$/i, '');
  return { gcode: ptsToGcode(allPts, cleanName), newEndPoint };
}
