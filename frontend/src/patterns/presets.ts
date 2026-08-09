import type { TableBounds } from '../lib/types';
import { wasm } from '../lib/wasmClient';
import { parseGcode, ptsToGcode } from '../lib/gcode';
import { fitPointsToTable } from '../lib/geometry/fitToTable';
import { applySymmetryToGcode } from '../lib/geometry/symmetry';

export type PresetType =
  | 'rose'
  | 'maurer'
  | 'spirograph'
  | 'lissajous'
  | 'spiral'
  | 'lsystem'
  | 'logspiral'
  | 'flowfield'
  | 'butterfly'
  | 'raster'
  | 'file';

/** One gallery entry. Fields beyond cat/name/desc/type/sym are whichever
 * ones the given `type` needs — see buildGcodeFromPreset's switch. Mirrors
 * the old index.html's PRESETS shape verbatim (not restructured), since
 * this data is inert config, not code that benefits from a stricter type. */
export interface Preset {
  cat: string;
  name: string;
  desc: string;
  type: PresetType;
  sym?: number;
  file?: string;
  rows?: number;
  margin?: number;
  turns?: number;
  gap?: number;
  scale?: number;
  preset?: string;
  depth?: number;
  n?: number;
  d?: number;
  R?: number;
  r?: number;
  epi?: boolean;
  a?: number;
  b?: number;
  delta?: number;
  seed?: number;
  particles?: number;
  steps?: number;
  ns?: number;
  str?: number;
}

export const PRESETS: Preset[] = [
  // ANIMALS (pre-made G-code files, not algorithmically generated)
  { cat: '🐾 Animals', name: 'Mastan', desc: 'Labrador retriever', type: 'file', file: '/animals/mastan.gcode', sym: 1 },
  { cat: '🐾 Animals', name: 'Turtle', desc: 'Turtle', type: 'file', file: '/animals/turtle.gcode', sym: 1 },

  // ERASERS
  { cat: '🧹 Erasers', name: 'Rake', desc: '60 rows — fast, clean finish', type: 'raster', rows: 60, margin: 0.01 },
  { cat: '🧹 Erasers', name: 'Fine Rake', desc: '120 rows — thorough coverage', type: 'raster', rows: 120, margin: 0.01 },
  { cat: '🧹 Erasers', name: 'Deep Clean', desc: '200 rows — very dense pass', type: 'raster', rows: 200, margin: 0.005 },
  { cat: '🧹 Erasers', name: 'Zen Spiral', desc: 'Tight spiral — wipes center out', type: 'spiral', turns: 90, gap: 0.012, scale: 0.98, sym: 1 },
  { cat: '🧹 Erasers', name: 'Grid Fill', desc: 'Hilbert curve — systematic grid', type: 'lsystem', preset: 'hilbert', depth: 6, scale: 0.97, sym: 1 },

  // ORGANIC
  { cat: '🦋 Organic', name: 'Butterfly', desc: '4-lobed organic wing curve', type: 'butterfly', scale: 0.88, sym: 1 },
  { cat: '🦋 Organic', name: 'Fern', desc: 'Branching fractal fern', type: 'lsystem', preset: 'plant', depth: 5, scale: 0.85, sym: 1 },

  // FILL & FLOW
  { cat: '🌊 Fill & Flow', name: 'Galaxy', desc: '3-armed spiral, like a galaxy', type: 'logspiral', b: 0.3, turns: 2.0, scale: 0.9, sym: 3 },
  { cat: '🌊 Fill & Flow', name: 'Ocean Breeze', desc: 'Gentle flowing curves', type: 'flowfield', seed: 1, particles: 200, steps: 500, ns: 0.8, str: 1.5, scale: 0.9, sym: 1 },
  { cat: '🌊 Fill & Flow', name: 'Storm', desc: 'Turbulent swirling vortices', type: 'flowfield', seed: 7, particles: 300, steps: 200, ns: 3.0, str: 3.0, scale: 0.9, sym: 1 },
  { cat: '🌊 Fill & Flow', name: 'Gosper Island', desc: 'Hexagonal space-fill curve', type: 'lsystem', preset: 'gosper', depth: 4, scale: 0.9, sym: 1 },

  // FLOWERS (petal rose)
  { cat: '🌸 Flowers', name: 'Daisy', desc: '5 smooth petals', type: 'rose', n: 5, d: 1, scale: 0.9, sym: 1 },
  { cat: '🌸 Flowers', name: 'Chrysanthemum', desc: '8 rounded petals', type: 'rose', n: 4, d: 1, scale: 0.9, sym: 1 },
  { cat: '🌸 Flowers', name: 'Wild Rose', desc: '7 petals with inner ring', type: 'rose', n: 7, d: 2, scale: 0.9, sym: 1 },
  { cat: '🌸 Flowers', name: 'Garden Web', desc: 'Complex 22-petal bloom', type: 'rose', n: 11, d: 4, scale: 0.9, sym: 1 },

  // SPIROGRAPH
  { cat: '🌀 Spirograph', name: 'Classic Star', desc: '5-pointed spirograph star', type: 'spirograph', R: 5, r: 3, d: 5, epi: false, scale: 0.9, sym: 1 },
  { cat: '🌀 Spirograph', name: 'Snowdrop', desc: 'Delicate 7-spoke pattern', type: 'spirograph', R: 7, r: 2, d: 5, epi: false, scale: 0.9, sym: 1 },
  { cat: '🌀 Spirograph', name: 'Clover', desc: '3-leaf clover shape', type: 'spirograph', R: 3, r: 1, d: 1, epi: true, scale: 0.9, sym: 1 },
  { cat: '🌀 Spirograph', name: 'Peach Blossom', desc: '5-petal flower (epitrochoid)', type: 'spirograph', R: 5, r: 1, d: 2, epi: true, scale: 0.9, sym: 1 },

  // GEOMETRIC / FRACTALS
  { cat: '❄️ Geometric', name: 'Snowflake', desc: 'Koch fractal snowflake', type: 'lsystem', preset: 'koch', depth: 4, scale: 0.9, sym: 1 },
  { cat: '❄️ Geometric', name: 'Triangle', desc: 'Sierpinski triangle', type: 'lsystem', preset: 'sierpinski', depth: 6, scale: 0.9, sym: 1 },
  { cat: '❄️ Geometric', name: 'Dragon Wing', desc: 'Folded-paper fractal', type: 'lsystem', preset: 'dragon', depth: 12, scale: 0.9, sym: 1 },

  // KNOT CURVES (Lissajous)
  { cat: '🔗 Knot Curves', name: 'Celtic Knot', desc: 'Classic 3:2 woven figure', type: 'lissajous', a: 3, b: 2, delta: 0.5, scale: 0.9, sym: 1 },
  { cat: '🔗 Knot Curves', name: 'Figure-8', desc: 'Sideways infinity loop', type: 'lissajous', a: 1, b: 2, delta: 0.5, scale: 0.9, sym: 1 },
  { cat: '🔗 Knot Curves', name: 'Star Weave', desc: 'Dense 7:6 woven star', type: 'lissajous', a: 7, b: 6, delta: 0.3, scale: 0.9, sym: 1 },
];

const presetFileCache: Record<string, string> = {};
async function loadPresetFile(path: string): Promise<string> {
  if (presetFileCache[path]) return presetFileCache[path];
  const r = await fetch(path);
  if (!r.ok) throw new Error(`Couldn't load ${path} (HTTP ${r.status})`);
  const text = await r.text();
  presetFileCache[path] = text;
  return text;
}

export async function buildGcodeFromPreset(p: Preset, sym: number, table: TableBounds): Promise<string> {
  let gcode: string;
  switch (p.type) {
    case 'rose':
      gcode = wasm.genRose(p.n!, p.d!, p.scale!);
      break;
    case 'maurer':
      gcode = wasm.genMaurerRose(p.n!, p.d!, p.scale!);
      break;
    case 'spirograph':
      gcode = wasm.genSpirograph(p.R!, p.r!, p.d!, p.epi!, p.scale!);
      break;
    case 'lissajous':
      gcode = wasm.genLissajous(p.a!, p.b!, p.delta!, p.scale!);
      break;
    case 'spiral':
      gcode = wasm.genSpiral(p.turns!, p.gap!, p.scale!);
      break;
    case 'lsystem':
      gcode = wasm.genLsystem(p.preset!, p.depth!, p.scale!);
      break;
    case 'logspiral':
      gcode = wasm.genLogarithmic(p.b!, p.turns!, p.scale!);
      break;
    case 'flowfield':
      gcode = wasm.genFlowfield(p.seed!, p.particles!, p.steps!, p.ns!, p.str!, p.scale!);
      break;
    case 'butterfly':
      gcode = wasm.genButterfly(p.scale!);
      break;
    case 'raster':
      gcode = wasm.genRaster(p.rows!, p.margin!);
      break;
    case 'file': {
      const raw = await loadPresetFile(p.file!);
      gcode = ptsToGcode(fitPointsToTable(parseGcode(raw), table, 0.03), p.name);
      break;
    }
  }
  const effectiveSym = sym > 1 ? sym : (p.sym ?? 1);
  return effectiveSym > 1 ? applySymmetryToGcode(gcode, effectiveSym, table) : gcode;
}
