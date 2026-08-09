import type { TableBounds } from '../types';
import { parseGcode, ptsToGcode } from '../gcode';

/** Repeats a pattern `n` times evenly around the table center (rotational
 * symmetry / "kaleidoscope copies"). Scales down first if needed so every
 * copy still fits within the table's inscribed circle. */
export function applySymmetryToGcode(gcode: string, n: number, table: TableBounds): string {
  const raw = parseGcode(gcode);
  if (!raw.length) return gcode;

  const centered = raw.map((p) => ({ x: p.x - table.cx, y: p.y - table.cy }));
  const maxR = Math.max(...centered.map((p) => Math.hypot(p.x, p.y)));
  const halfSafe = (Math.min(table.w, table.h) / 2) * 0.92;
  const scl = maxR > halfSafe ? halfSafe / maxR : 1;

  const result = [];
  for (let k = 0; k < n; k++) {
    const a = (k * 2 * Math.PI) / n;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (const p of centered) {
      const rx = p.x * scl;
      const ry = p.y * scl;
      result.push({ x: table.cx + rx * ca - ry * sa, y: table.cy + rx * sa + ry * ca });
    }
  }
  return ptsToGcode(result, 'sym_pattern');
}
