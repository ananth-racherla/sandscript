use wasm_bindgen::prelude::*;

fn e(err: anyhow::Error) -> JsValue {
    JsValue::from_str(&err.to_string())
}

#[wasm_bindgen(start)]
pub fn start() {
    console_error_panic_hook::set_once();
}

/// Set the table's physical working area in mm. Affects every pattern
/// generated afterward (existing G-code already generated is unaffected).
#[wasm_bindgen]
pub fn set_table_size(x_min: f64, x_max: f64, y_min: f64, y_max: f64) {
    crate::gcode::set_table_dims(x_min, x_max, y_min, y_max);
}

/// Rose curve.  steps fixed at 8 000 — enough for any k=n/d.
#[wasm_bindgen]
pub fn gen_rose(n: u32, d: u32, scale: f64) -> Result<String, JsValue> {
    crate::gen_rose_gcode(n, d, 8_000, scale, 2000).map_err(e)
}

/// Lissajous figure.  steps fixed at 8 000.
#[wasm_bindgen]
pub fn gen_lissajous(a: u32, b: u32, delta: f64, scale: f64) -> Result<String, JsValue> {
    crate::gen_lissajous_gcode(a, b, delta, 8_000, scale, 2000).map_err(e)
}

/// Spirograph.  epi=false → hypotrochoid (classic), epi=true → epitrochoid.
#[wasm_bindgen]
pub fn gen_spirograph(
    big_r: f64,
    small_r: f64,
    pen_d: f64,
    epi: bool,
    scale: f64,
) -> Result<String, JsValue> {
    crate::gen_spirograph_gcode(big_r, small_r, pen_d, epi, 20_000, scale, 2000).map_err(e)
}

/// Archimedean spiral fill.
#[wasm_bindgen]
pub fn gen_spiral(turns: f64, gap: f64, scale: f64) -> Result<String, JsValue> {
    crate::gen_spiral_gcode(turns, gap, 40_000, scale, 2000).map_err(e)
}

/// L-system fractal.  preset: "hilbert" | "gosper" | "sierpinski" | "dragon" | "koch" | "plant"
#[wasm_bindgen]
pub fn gen_lsystem(preset: &str, depth: u32, scale: f64) -> Result<String, JsValue> {
    crate::gen_lsystem_gcode(preset, depth, scale, 2000).map_err(e)
}

/// Logarithmic spiral arm (galaxy-style). b: growth rate (~0.2-0.4 typical), turns: rotations.
#[wasm_bindgen]
pub fn gen_logarithmic(b: f64, turns: f64, scale: f64) -> Result<String, JsValue> {
    crate::gen_logarithmic_gcode(b, turns, 4_000, scale, 2000).map_err(e)
}

/// Perlin noise flow field.
#[wasm_bindgen]
pub fn gen_flowfield(
    seed: u32,
    particles: usize,
    particle_steps: usize,
    noise_scale: f64,
    strength: f64,
    scale: f64,
) -> Result<String, JsValue> {
    crate::gen_flowfield_gcode(
        seed,
        particles,
        particle_steps,
        0.01,
        noise_scale,
        strength,
        scale,
        2000,
    )
    .map_err(e)
}

/// Convert SVG text to G-code.
#[wasm_bindgen]
pub fn gen_from_svg(svg_text: &str, spu: f64, margin: f64) -> Result<String, JsValue> {
    crate::gen_from_svg_gcode(svg_text, spu, margin, 2000).map_err(e)
}

/// Maurer rose web pattern.  n=5,d=97 or n=6,d=71 are stunning.
#[wasm_bindgen]
pub fn gen_maurer_rose(n: u32, d: u32, scale: f64) -> Result<String, JsValue> {
    crate::gen_maurer_rose_gcode(n, d, scale, 2000).map_err(e)
}

/// Butterfly curve — organic 4-lobed figure.
#[wasm_bindgen]
pub fn gen_butterfly(scale: f64) -> Result<String, JsValue> {
    crate::gen_butterfly_gcode(scale, 2000).map_err(e)
}

/// Boustrophedon raster — rows horizontal lines covering the full table.
/// rows: number of passes (40 = coarse, 80 = fine, 160 = very fine).
/// margin: border fraction to leave empty (0.0–0.05).
#[wasm_bindgen]
pub fn gen_raster(rows: u32, margin: f64) -> Result<String, JsValue> {
    crate::gen_raster_gcode(rows as usize, margin, 2000).map_err(e)
}

/// Simplify an existing G-code string with Douglas-Peucker.
/// epsilon_mm: tolerance in mm — 0 = only remove exact duplicates.
#[wasm_bindgen]
pub fn optimize_gcode(gcode: &str, epsilon_mm: f64) -> Result<String, JsValue> {
    crate::optimize_gcode_str(gcode, epsilon_mm).map_err(e)
}
