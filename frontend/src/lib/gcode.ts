import type { Pt } from './types';

/** Extract every `G1 X.. Y..` move from a G-code string. */
export function parseGcode(text: string): Pt[] {
  const re = /G1\s+X([+-]?\d+\.?\d*)\s+Y([+-]?\d+\.?\d*)/g;
  const out: Pt[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ x: +m[1], y: +m[2] });
  }
  return out;
}

/** Serialize points to a G-code string. Header format must stay in sync
 * with the Rust side's `write_gcode` in src/gcode.rs — both produce
 * G-code consumed by the same printer, so a drift here would only show up
 * as a subtly malformed file, not a compile/type error. */
export function ptsToGcode(pts: Pt[], name = 'pattern'): string {
  const header = `;\n; File name: '${name}'\n; File type: gcode\n;\n; BEGIN PRE\nG1F2000\n; END PRE\n`;
  const body = pts.map((p) => `G1 X${p.x.toFixed(3)} Y${p.y.toFixed(3)}`).join('\n');
  return header + '\n' + body;
}
