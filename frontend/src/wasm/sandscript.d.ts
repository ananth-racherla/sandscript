/* tslint:disable */
/* eslint-disable */

/**
 * Butterfly curve — organic 4-lobed figure.
 */
export function gen_butterfly(scale: number): string;

/**
 * Perlin noise flow field.
 */
export function gen_flowfield(seed: number, particles: number, particle_steps: number, noise_scale: number, strength: number, scale: number): string;

/**
 * Convert SVG text to G-code.
 */
export function gen_from_svg(svg_text: string, spu: number, margin: number, min_feature_frac: number, flip_horizontal: boolean, flip_vertical: boolean): string;

/**
 * Lissajous figure.  steps fixed at 8 000.
 */
export function gen_lissajous(a: number, b: number, delta: number, scale: number): string;

/**
 * Logarithmic spiral arm (galaxy-style). b: growth rate (~0.2-0.4 typical), turns: rotations.
 */
export function gen_logarithmic(b: number, turns: number, scale: number): string;

/**
 * L-system fractal.  preset: "hilbert" | "gosper" | "sierpinski" | "dragon" | "koch" | "plant"
 */
export function gen_lsystem(preset: string, depth: number, scale: number): string;

/**
 * Maurer rose web pattern.  n=5,d=97 or n=6,d=71 are stunning.
 */
export function gen_maurer_rose(n: number, d: number, scale: number): string;

/**
 * Boustrophedon raster — rows horizontal lines covering the full table.
 * rows: number of passes (40 = coarse, 80 = fine, 160 = very fine).
 * margin: border fraction to leave empty (0.0–0.05).
 */
export function gen_raster(rows: number, margin: number): string;

/**
 * Rose curve.  steps fixed at 8 000 — enough for any k=n/d.
 */
export function gen_rose(n: number, d: number, scale: number): string;

/**
 * Archimedean spiral fill.
 */
export function gen_spiral(turns: number, gap: number, scale: number): string;

/**
 * Spirograph.  epi=false → hypotrochoid (classic), epi=true → epitrochoid.
 */
export function gen_spirograph(big_r: number, small_r: number, pen_d: number, epi: boolean, scale: number): string;

/**
 * Simplify an existing G-code string with Douglas-Peucker.
 * epsilon_mm: tolerance in mm — 0 = only remove exact duplicates.
 */
export function optimize_gcode(gcode: string, epsilon_mm: number): string;

/**
 * Set the table's physical working area in mm. Affects every pattern
 * generated afterward (existing G-code already generated is unaffected).
 */
export function set_table_size(x_min: number, x_max: number, y_min: number, y_max: number): void;

export function start(): void;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly gen_butterfly: (a: number) => [number, number, number, number];
    readonly gen_flowfield: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly gen_from_svg: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number, number];
    readonly gen_lissajous: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly gen_logarithmic: (a: number, b: number, c: number) => [number, number, number, number];
    readonly gen_lsystem: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly gen_maurer_rose: (a: number, b: number, c: number) => [number, number, number, number];
    readonly gen_raster: (a: number, b: number) => [number, number, number, number];
    readonly gen_rose: (a: number, b: number, c: number) => [number, number, number, number];
    readonly gen_spiral: (a: number, b: number, c: number) => [number, number, number, number];
    readonly gen_spirograph: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly optimize_gcode: (a: number, b: number, c: number) => [number, number, number, number];
    readonly set_table_size: (a: number, b: number, c: number, d: number) => void;
    readonly start: () => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
