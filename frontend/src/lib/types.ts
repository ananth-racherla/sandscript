export interface Pt {
  x: number;
  y: number;
}

/** Table working area, in mm. Always pass explicitly — nothing in lib/
 * closes over a module-level table singleton (that's what made the old
 * index.html's geometry functions hard to test/reuse). */
export interface TableBounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

/** Build a TableBounds from a width/height, matching the convention used
 * throughout: a fixed 5mm margin from machine (0,0) on both axes. */
export function makeTableBounds(width: number, height: number, xMin = 5, yMin = 5): TableBounds {
  const xMax = xMin + width;
  const yMax = yMin + height;
  return { xMin, xMax, yMin, yMax, w: width, h: height, cx: (xMin + xMax) / 2, cy: (yMin + yMax) / 2 };
}

export const DEFAULT_TABLE: TableBounds = makeTableBounds(515, 320);
