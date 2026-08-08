use crate::gcode::Pt;
use std::f64::consts::PI;

/// Maurer rose: connect points sampled at every d degrees on r = sin(n*θ).
/// Creates stunning web/lattice patterns. Try n=5,d=97 or n=6,d=71.
pub fn maurer_rose(n: u32, d: u32) -> Vec<Pt> {
    (0..=360)
        .map(|k| {
            let theta = k as f64 * d as f64 * PI / 180.0;
            let r = (n as f64 * theta).sin();
            Pt::new(r * theta.cos(), r * theta.sin())
        })
        .collect()
}

/// Rose curve: r = cos(k * theta).
/// For integer k: k odd → k petals, k even → 2k petals.
/// For rational k = n/d the curve closes after lcm periods.
pub fn rose(n: u32, d: u32, steps: usize) -> Vec<Pt> {
    let k = n as f64 / d as f64;
    // The curve closes after 2π*d (or π*d when n*d is odd)
    let periods = if (n * d) % 2 == 1 { d } else { 2 * d };
    let total = 2.0 * PI * periods as f64;
    (0..=steps)
        .map(|i| {
            let theta = total * i as f64 / steps as f64;
            let r = (k * theta).cos();
            Pt::new(r * theta.cos(), r * theta.sin())
        })
        .collect()
}
