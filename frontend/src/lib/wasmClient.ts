// Thin gate around the wasm-pack `--target web` output. The generated glue
// resolves its own .wasm via `new URL(..., import.meta.url)`, which Vite's
// asset pipeline handles natively — no bundler plugin needed.
import init, {
  gen_rose,
  gen_lissajous,
  gen_spirograph,
  gen_spiral,
  gen_lsystem,
  gen_logarithmic,
  gen_flowfield,
  gen_from_svg,
  gen_maurer_rose,
  gen_butterfly,
  gen_raster,
  optimize_gcode,
  set_table_size,
} from '../wasm/sandscript.js';

let readyPromise: Promise<void> | null = null;

/** Must resolve before any gen_* call. Safe to call multiple times. */
export function initWasm(): Promise<void> {
  if (!readyPromise) {
    readyPromise = init().then(() => undefined);
  }
  return readyPromise;
}

export const wasm = {
  genRose: gen_rose,
  genLissajous: gen_lissajous,
  genSpirograph: gen_spirograph,
  genSpiral: gen_spiral,
  genLsystem: gen_lsystem,
  genLogarithmic: gen_logarithmic,
  genFlowfield: gen_flowfield,
  genFromSvg: gen_from_svg,
  genMaurerRose: gen_maurer_rose,
  genButterfly: gen_butterfly,
  genRaster: gen_raster,
  optimizeGcode: optimize_gcode,
  setTableSize: set_table_size,
};
