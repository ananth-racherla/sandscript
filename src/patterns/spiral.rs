use crate::gcode::Pt;
use std::f64::consts::PI;

/// Archimedean spiral fill: r = a + b*theta, spiraling outward then back.
/// `turns` = number of outward rotations; `gap` = spacing between arms (in normalized units).
pub fn archimedean(turns: f64, gap: f64, steps: usize) -> Vec<Pt> {
    let total_theta = turns * 2.0 * PI;
    let outward: Vec<Pt> = (0..=steps)
        .map(|i| {
            let theta = total_theta * i as f64 / steps as f64;
            let r = gap * theta / (2.0 * PI);
            Pt::new(r * theta.cos(), r * theta.sin())
        })
        .collect();
    outward
}

/// Logarithmic spiral: r = a * e^(b*theta)
pub fn logarithmic(a: f64, b: f64, turns: f64, steps: usize) -> Vec<Pt> {
    let total = turns * 2.0 * PI;
    (0..=steps)
        .map(|i| {
            let theta = total * i as f64 / steps as f64;
            let r = a * (b * theta).exp();
            Pt::new(r * theta.cos(), r * theta.sin())
        })
        .collect()
}

/// Boustrophedon (back-and-forth) raster fill covering the full table rectangle.
/// Generates points directly in table coordinates — do NOT pass through normalize_to_table.
/// `rows` = number of horizontal passes; `margin_frac` = border fraction (0.0–0.1).
pub fn raster(rows: usize, margin_frac: f64) -> Vec<Pt> {
    use crate::gcode::{table_x_min, table_x_max, table_y_min, table_y_max, table_w, table_h};
    let xlo = table_x_min() + table_w() * margin_frac;
    let xhi = table_x_max() - table_w() * margin_frac;
    let ylo = table_y_min() + table_h() * margin_frac;
    let yhi = table_y_max() - table_h() * margin_frac;
    let mut pts = Vec::with_capacity((rows + 1) * 2);
    for i in 0..=rows {
        let y = ylo + (yhi - ylo) * i as f64 / rows as f64;
        if i % 2 == 0 {
            pts.push(Pt::new(xlo, y));
            pts.push(Pt::new(xhi, y));
        } else {
            pts.push(Pt::new(xhi, y));
            pts.push(Pt::new(xlo, y));
        }
    }
    pts
}

/// Butterfly curve: r = e^sin(θ) - 2cos(4θ) - sin⁵((2θ-π)/24)
/// A delicate 4-lobed figure that looks like butterfly wings.
pub fn butterfly(steps: usize) -> Vec<Pt> {
    let total = 24.0 * PI;
    (0..=steps)
        .map(|i| {
            let t = total * i as f64 / steps as f64;
            let r = t.sin().exp() - 2.0 * (4.0 * t).cos() - ((2.0 * t - PI) / 24.0).sin().powi(5);
            Pt::new(r * t.cos(), r * t.sin())
        })
        .collect()
}
