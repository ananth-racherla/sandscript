use crate::gcode::Pt;
use std::f64::consts::PI;

/// Lissajous: x = sin(a*t + delta), y = sin(b*t)
/// Closes after 2π (if a,b integer and coprime after 2π*lcm, but 2π is fine).
pub fn lissajous(a: u32, b: u32, delta_frac: f64, steps: usize) -> Vec<Pt> {
    let delta = delta_frac * PI;
    let lcm = lcm_u32(a, b);
    let total = 2.0 * PI * lcm as f64;
    (0..=steps)
        .map(|i| {
            let t = total * i as f64 / steps as f64;
            Pt::new((a as f64 * t + delta).sin(), (b as f64 * t).sin())
        })
        .collect()
}

fn gcd_u32(mut a: u32, mut b: u32) -> u32 {
    while b != 0 {
        let t = b;
        b = a % b;
        a = t;
    }
    a
}

fn lcm_u32(a: u32, b: u32) -> u32 {
    a / gcd_u32(a, b) * b
}
