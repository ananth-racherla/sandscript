pub mod gcode;
pub mod patterns;
pub mod svg_import;

#[cfg(target_arch = "wasm32")]
pub mod wasm_api;

use anyhow::Result;
use gcode::{fit_to_table, fit_to_table_stretch, normalize_to_table, write_gcode};
use patterns::spirograph::{epitrochoid, hypotrochoid};

pub fn gen_rose_gcode(n: u32, d: u32, steps: usize, scale: f64, feedrate: u32) -> Result<String> {
    let pts = normalize_to_table(&patterns::rose::rose(n, d, steps), scale);
    write_gcode("rose", &pts, feedrate)
}

pub fn gen_lissajous_gcode(
    a: u32,
    b: u32,
    delta: f64,
    steps: usize,
    scale: f64,
    feedrate: u32,
) -> Result<String> {
    let pts = normalize_to_table(&patterns::lissajous::lissajous(a, b, delta, steps), scale);
    write_gcode("lissajous", &pts, feedrate)
}

pub fn gen_spirograph_gcode(
    big_r: f64,
    small_r: f64,
    pen_d: f64,
    epi: bool,
    steps: usize,
    scale: f64,
    feedrate: u32,
) -> Result<String> {
    let raw = if epi {
        epitrochoid(big_r, small_r, pen_d, steps)
    } else {
        hypotrochoid(big_r, small_r, pen_d, steps)
    };
    let pts = normalize_to_table(&raw, scale);
    write_gcode("spirograph", &pts, feedrate)
}

pub fn gen_spiral_gcode(
    turns: f64,
    gap: f64,
    steps: usize,
    scale: f64,
    feedrate: u32,
) -> Result<String> {
    let raw = patterns::spiral::archimedean(turns, gap, steps);
    let pts = fit_to_table(&raw, (1.0 - scale) / 2.0);
    write_gcode("spiral", &pts, feedrate)
}

pub fn gen_lsystem_gcode(preset: &str, depth: u32, scale: f64, feedrate: u32) -> Result<String> {
    let raw = match preset {
        "hilbert" => patterns::lsystem::hilbert(depth),
        "gosper" => patterns::lsystem::gosper(depth),
        "sierpinski" => patterns::lsystem::sierpinski(depth),
        "dragon" => patterns::lsystem::dragon(depth),
        "koch" => patterns::lsystem::koch(depth),
        "plant" => patterns::lsystem::plant(depth),
        other => anyhow::bail!("Unknown L-system preset: {other}"),
    };
    // Hilbert is used as a grid-fill eraser — stretch to cover the whole
    // rectangular table rather than preserving its natural square aspect.
    let pts = if preset == "hilbert" {
        fit_to_table_stretch(&raw, (1.0 - scale) / 2.0)
    } else {
        fit_to_table(&raw, (1.0 - scale) / 2.0)
    };
    write_gcode("lsystem", &pts, feedrate)
}

/// Logarithmic spiral (single arm), origin-centered so `sym` copies converge cleanly.
pub fn gen_logarithmic_gcode(
    b: f64,
    turns: f64,
    steps: usize,
    scale: f64,
    feedrate: u32,
) -> Result<String> {
    let raw = patterns::spiral::logarithmic(1.0, b, turns, steps);
    let max_r = raw
        .iter()
        .map(|p| (p.x * p.x + p.y * p.y).sqrt())
        .fold(0.0_f64, f64::max)
        .max(1e-9);
    let norm: Vec<gcode::Pt> = raw
        .iter()
        .map(|p| gcode::Pt::new(p.x / max_r, p.y / max_r))
        .collect();
    let pts = normalize_to_table(&norm, scale);
    write_gcode("logarithmic", &pts, feedrate)
}

// One parameter per flow-field knob (seed, particle count/length, noise
// shape, output scale/feedrate) — a params struct isn't worth it for the
// single call site in wasm_api.rs.
#[allow(clippy::too_many_arguments)]
pub fn gen_flowfield_gcode(
    seed: u32,
    particles: usize,
    particle_steps: usize,
    step_size: f64,
    noise_scale: f64,
    strength: f64,
    scale: f64,
    feedrate: u32,
) -> Result<String> {
    let raw = patterns::flowfield::flow_field(
        seed,
        particles,
        particle_steps,
        step_size,
        noise_scale,
        strength,
    );
    let pts = normalize_to_table(&raw, scale);
    write_gcode("flowfield", &pts, feedrate)
}

#[allow(clippy::too_many_arguments)]
pub fn gen_from_svg_gcode(
    svg_text: &str,
    spu: f64,
    margin: f64,
    min_feature_frac: f64,
    flip_horizontal: bool,
    flip_vertical: bool,
    feedrate: u32,
) -> Result<String> {
    let segments = svg_import::parse_svg(
        svg_text,
        spu,
        min_feature_frac,
        flip_horizontal,
        flip_vertical,
    )?;
    let pts = svg_import::stitch(segments);
    let pts = fit_to_table(&pts, margin);
    write_gcode("from_svg", &pts, feedrate)
}

pub fn gen_maurer_rose_gcode(n: u32, d: u32, scale: f64, feedrate: u32) -> Result<String> {
    let pts = normalize_to_table(&patterns::rose::maurer_rose(n, d), scale);
    write_gcode("maurer_rose", &pts, feedrate)
}

pub fn gen_butterfly_gcode(scale: f64, feedrate: u32) -> Result<String> {
    let raw = patterns::spiral::butterfly(6000);
    let pts = fit_to_table(&raw, (1.0 - scale) / 2.0);
    write_gcode("butterfly", &pts, feedrate)
}

/// Boustrophedon raster fill — rows of horizontal lines across the full table.
/// Points are already in table coordinates; no further scaling is applied.
pub fn gen_raster_gcode(rows: usize, margin: f64, feedrate: u32) -> Result<String> {
    let pts = patterns::spiral::raster(rows, margin);
    write_gcode("raster", &pts, feedrate)
}

/// Re-optimise an existing G-code string: remove duplicate points and simplify
/// with Douglas-Peucker at `epsilon_mm` precision.
pub fn optimize_gcode_str(gcode: &str, epsilon_mm: f64) -> Result<String> {
    let feedrate = gcode
        .lines()
        .find_map(|l| {
            l.trim()
                .strip_prefix("G1F")
                .and_then(|v| v.parse::<u32>().ok())
        })
        .unwrap_or(2000);
    let pts = gcode::parse_gcode_pts(gcode);
    if pts.is_empty() {
        anyhow::bail!("No G1 moves found in G-code");
    }
    let pts = gcode::deduplicate(&pts, 0.1);
    let pts = if epsilon_mm > 0.0 {
        gcode::douglas_peucker(&pts, epsilon_mm)
    } else {
        pts
    };
    write_gcode("optimized", &pts, feedrate)
}
