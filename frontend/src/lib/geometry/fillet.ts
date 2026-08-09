import type { Pt } from '../types';

/** Below this deflection angle a vertex is treated as "already straight"
 * and left untouched — this is what keeps the fillet from ever distorting
 * an already-smooth curve, only real corners. */
const CORNER_ANGLE_DEG = 8;

function sampleArc(center: Pt, radius: number, aStart: number, aEnd: number, steps: number): Pt[] {
  let d = aEnd - aStart;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const out: Pt[] = [];
  for (let k = 1; k < steps; k++) {
    const a = aStart + (d * k) / steps;
    out.push({ x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) });
  }
  return out;
}

/** Geometric corner fillet: at each vertex where the path actually turns
 * sharply, insert a real circular arc of the requested radius, tangent to
 * both edges — the same construction CNC/vector tools use for "corner
 * radius." This is a preview-only simulation of the ball's momentum
 * lagging behind sharp turns; it never touches the raw pattern points that
 * get downloaded/sent to print. Ported verbatim from the old index.html's
 * `filletCorners`. */
export function filletCorners(rawPts: Pt[], radiusMM: number): Pt[] {
  const n = rawPts.length;
  if (n < 3 || radiusMM <= 0) return rawPts;
  const thresh = (CORNER_ANGLE_DEG * Math.PI) / 180;
  const out: Pt[] = [rawPts[0]];

  for (let i = 1; i < n - 1; i++) {
    const A = rawPts[i - 1];
    const B = rawPts[i];
    const C = rawPts[i + 1];
    const v1x = B.x - A.x;
    const v1y = B.y - A.y;
    const len1 = Math.hypot(v1x, v1y);
    const v2x = C.x - B.x;
    const v2y = C.y - B.y;
    const len2 = Math.hypot(v2x, v2y);
    if (len1 < 1e-9 || len2 < 1e-9) {
      out.push(B);
      continue;
    }

    // e1/e2 point from B back toward A and forward toward C.
    const e1x = -v1x / len1;
    const e1y = -v1y / len1;
    const e2x = v2x / len2;
    const e2y = v2y / len2;
    const dot = Math.min(1, Math.max(-1, e1x * e2x + e1y * e2y));
    const deflection = Math.PI - Math.acos(dot); // 0 = straight, larger = sharper turn
    if (deflection < thresh) {
      out.push(B);
      continue;
    }

    const interior = Math.PI - deflection;
    let t = radiusMM / Math.tan(interior / 2);
    t = Math.min(t, len1 * 0.5, len2 * 0.5);
    if (t < 1e-6) {
      out.push(B);
      continue;
    }

    const actualR = t * Math.tan(interior / 2);
    const p1: Pt = { x: B.x + e1x * t, y: B.y + e1y * t };
    const p2: Pt = { x: B.x + e2x * t, y: B.y + e2y * t };
    const bx = e1x + e2x;
    const by = e1y + e2y;
    const bLen = Math.hypot(bx, by);
    if (bLen < 1e-9) {
      out.push(B);
      continue;
    }

    const sinHalf = Math.sin(interior / 2);
    const center: Pt = {
      x: B.x + (bx / bLen) * (actualR / sinHalf),
      y: B.y + (by / bLen) * (actualR / sinHalf),
    };
    const steps = Math.max(3, Math.min(16, Math.round(actualR)));
    out.push(p1);
    for (const p of sampleArc(center, actualR, Math.atan2(p1.y - center.y, p1.x - center.x), Math.atan2(p2.y - center.y, p2.x - center.x), steps)) {
      out.push(p);
    }
    out.push(p2);
  }

  out.push(rawPts[n - 1]);
  return out;
}
