import type { Pt } from '../types';

/** cumDist[i] is the physical distance (mm) traveled from pts[0] to pts[i]
 * along the polyline. cumDist[0] is always 0, cumDist is non-decreasing. */
export function cumulativeDistances(pts: Pt[]): number[] {
  const cum = new Array(pts.length).fill(0);
  for (let i = 1; i < pts.length; i++) {
    cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return cum;
}

/** Largest index i such that cumDist[i] <= targetDist — i.e. how far along
 * the polyline you've physically traveled after covering targetDist mm.
 * Binary search since cumDist is sorted (non-decreasing). */
export function indexAtDistance(cumDist: number[], targetDist: number): number {
  let lo = 0;
  let hi = cumDist.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cumDist[mid] <= targetDist) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
