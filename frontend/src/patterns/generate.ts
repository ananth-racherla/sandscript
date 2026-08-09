import type { TableBounds } from '../lib/types';
import { wasm } from '../lib/wasmClient';
import { applySymmetryToGcode } from '../lib/geometry/symmetry';

export interface GenerateResult {
  gcode: string;
  name: string;
}

/** Explicit per-type switch rather than reflected from configs.ts's
 * ParamSpec schema — SVG needs an async file read the others don't, and a
 * reflection layer to dodge a ~10-case switch isn't worth it. The schema
 * drives the form UI; this drives generation. */
export async function generateCustomGcode(type: string, values: Record<string, unknown>, table: TableBounds): Promise<GenerateResult> {
  const num = (key: string) => values[key] as number;
  const str = (key: string) => values[key] as string;

  let gcode: string;
  let name: string;

  switch (type) {
    case 'rose':
      gcode = wasm.genRose(num('n'), num('d'), num('scale'));
      name = 'rose';
      break;
    case 'maurer':
      gcode = wasm.genMaurerRose(num('n'), num('d'), num('scale'));
      name = 'maurer_rose';
      break;
    case 'spirograph':
      gcode = wasm.genSpirograph(num('R'), num('r'), num('d'), str('mode') === 'epi', num('scale'));
      name = 'spirograph';
      break;
    case 'lissajous':
      gcode = wasm.genLissajous(num('a'), num('b'), num('delta'), num('scale'));
      name = 'lissajous';
      break;
    case 'spiral':
      gcode = wasm.genSpiral(num('turns'), num('gap'), num('scale'));
      name = 'spiral';
      break;
    case 'lsystem':
      gcode = wasm.genLsystem(str('preset'), num('depth'), num('scale'));
      name = 'lsystem';
      break;
    case 'flowfield':
      gcode = wasm.genFlowfield(num('seed') || 0, num('particles'), num('steps'), num('noiseScale'), num('strength'), num('scale'));
      name = 'flowfield';
      break;
    case 'butterfly':
      gcode = wasm.genButterfly(num('scale'));
      name = 'butterfly';
      break;
    case 'raster':
      gcode = wasm.genRaster(num('rows'), num('margin'));
      name = 'raster';
      break;
    case 'svg': {
      const file = values.svgFile as File | null;
      if (!file) throw new Error('No SVG file selected — click the SVG panel to pick one');
      const text = await file.text();
      gcode = wasm.genFromSvg(text, num('spu'), num('margin'));
      name = 'from_svg';
      break;
    }
    default:
      throw new Error(`Unknown type: ${type}`);
  }

  const sym = num('sym');
  if (sym > 1) gcode = applySymmetryToGcode(gcode, sym, table);
  return { gcode, name: `${name}.gcode` };
}
