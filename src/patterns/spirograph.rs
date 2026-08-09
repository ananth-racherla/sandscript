use crate::gcode::Pt;
use std::f64::consts::PI;

/// Hypotrochoid: small circle (r) rolling inside large circle (R),
/// pen at distance d from center of small circle.
/// x = (R-r)*cos(t) + d*cos((R-r)/r * t)
/// y = (R-r)*sin(t) - d*sin((R-r)/r * t)
pub fn hypotrochoid(big_r: f64, small_r: f64, pen_d: f64, steps: usize) -> Vec<Pt> {
    let periods = rational_periods(big_r, small_r);
    let total = 2.0 * PI * periods;
    let norm = (big_r - small_r).abs() + pen_d; // max possible radius
    (0..=steps)
        .map(|i| {
            let t = total * i as f64 / steps as f64;
            let x = (big_r - small_r) * t.cos() + pen_d * ((big_r - small_r) / small_r * t).cos();
            let y = (big_r - small_r) * t.sin() - pen_d * ((big_r - small_r) / small_r * t).sin();
            Pt::new(x / norm, y / norm)
        })
        .collect()
}

/// Epitrochoid: small circle rolling outside large circle.
pub fn epitrochoid(big_r: f64, small_r: f64, pen_d: f64, steps: usize) -> Vec<Pt> {
    let periods = rational_periods(big_r, small_r);
    let total = 2.0 * PI * periods;
    let norm = big_r + small_r + pen_d; // max possible radius
    (0..=steps)
        .map(|i| {
            let t = total * i as f64 / steps as f64;
            let x = (big_r + small_r) * t.cos() - pen_d * ((big_r + small_r) / small_r * t).cos();
            let y = (big_r + small_r) * t.sin() - pen_d * ((big_r + small_r) / small_r * t).sin();
            Pt::new(x / norm, y / norm)
        })
        .collect()
}

/// Returns number of full rotations needed to close the curve.
/// Approximates R/r as a rational p/q and returns q.
fn rational_periods(big_r: f64, small_r: f64) -> f64 {
    let ratio = big_r / small_r;
    // Try to find rational approximation with denominator up to 200
    let mut best = (1u64, (ratio - 1.0).abs());
    for q in 1u64..=200 {
        let p = (ratio * q as f64).round() as u64;
        let err = (ratio - p as f64 / q as f64).abs();
        if err < best.1 {
            best = (q, err);
        }
        if err < 1e-6 {
            break;
        }
    }
    best.0 as f64
}
