use crate::gcode::Pt;
use noise::{NoiseFn, Perlin};
use std::f64::consts::PI;

/// Perlin noise flow field: drop many particles and trace their paths.
/// Returns one long concatenated path (particles joined end-to-end).
pub fn flow_field(
    seed: u32,
    n_particles: usize,
    steps_per_particle: usize,
    step_size: f64,
    noise_scale: f64,
    noise_strength: f64,
) -> Vec<Pt> {
    let perlin = Perlin::new(seed);

    let mut pts: Vec<Pt> = Vec::with_capacity(n_particles * steps_per_particle);

    for i in 0..n_particles {
        // Spread starts in a grid
        let cols = (n_particles as f64).sqrt().ceil() as usize;
        let row = i / cols;
        let col = i % cols;
        let fx = (col as f64 + 0.5) / cols as f64 * 2.0 - 1.0;
        let fy = (row as f64 + 0.5) / (n_particles / cols + 1) as f64 * 2.0 - 1.0;

        let mut x = fx;
        let mut y = fy;

        if !pts.is_empty() {
            // Travel line from last point to new start (ball still moves)
            pts.push(Pt::new(x, y));
        }

        for _ in 0..steps_per_particle {
            pts.push(Pt::new(x, y));
            let angle = perlin.get([x * noise_scale, y * noise_scale, 0.0]) * noise_strength * PI;
            x += step_size * angle.cos();
            y += step_size * angle.sin();
            // clamp to [-1,1] box
            if x.abs() > 1.0 || y.abs() > 1.0 {
                break;
            }
        }
    }
    pts
}
