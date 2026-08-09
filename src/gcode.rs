use std::cell::Cell;
use std::fmt::Write as FmtWrite;

/// Table working area in mm. Defaults match the original hard-coded values
/// (derived from existing gcode files); user-adjustable at runtime via
/// `set_table_dims` so different physical table sizes can be previewed.
#[derive(Clone, Copy)]
struct TableDims {
    x_min: f64,
    x_max: f64,
    y_min: f64,
    y_max: f64,
}

thread_local! {
    static TABLE: Cell<TableDims> = const {
        Cell::new(TableDims {
            x_min: 5.0,
            x_max: 520.0,
            y_min: 5.0,
            y_max: 325.0,
        })
    };
}

/// Set the table's working area. Affects every pattern generated afterward.
pub fn set_table_dims(x_min: f64, x_max: f64, y_min: f64, y_max: f64) {
    TABLE.with(|t| {
        t.set(TableDims {
            x_min,
            x_max,
            y_min,
            y_max,
        })
    });
}

pub fn table_x_min() -> f64 {
    TABLE.with(|t| t.get().x_min)
}
pub fn table_x_max() -> f64 {
    TABLE.with(|t| t.get().x_max)
}
pub fn table_y_min() -> f64 {
    TABLE.with(|t| t.get().y_min)
}
pub fn table_y_max() -> f64 {
    TABLE.with(|t| t.get().y_max)
}
pub fn table_cx() -> f64 {
    (table_x_min() + table_x_max()) / 2.0
}
pub fn table_cy() -> f64 {
    (table_y_min() + table_y_max()) / 2.0
}
pub fn table_w() -> f64 {
    table_x_max() - table_x_min()
}
pub fn table_h() -> f64 {
    table_y_max() - table_y_min()
}

#[derive(Clone, Copy, Debug)]
pub struct Pt {
    pub x: f64,
    pub y: f64,
}

impl Pt {
    pub fn new(x: f64, y: f64) -> Self {
        Self { x, y }
    }

    pub fn dist2(&self, other: &Pt) -> f64 {
        let dx = self.x - other.x;
        let dy = self.y - other.y;
        dx * dx + dy * dy
    }
}

/// Scale a path from normalized coords (center=0,0 radius=1) to table coords.
/// `scale` is 0..1 fraction of the table's smaller dimension.
pub fn normalize_to_table(pts: &[Pt], scale: f64) -> Vec<Pt> {
    if pts.is_empty() {
        return vec![];
    }
    let half = (table_w().min(table_h()) / 2.0) * scale;
    let (cx, cy) = (table_cx(), table_cy());
    pts.iter()
        .map(|p| Pt::new(cx + p.x * half, cy + p.y * half))
        .collect()
}

/// Bounding box as (min_x, max_x, min_y, max_y). Panics on an empty slice —
/// callers all guard for that first, since "no bbox" isn't a meaningful value.
fn bbox(pts: &[Pt]) -> (f64, f64, f64, f64) {
    let (mut minx, mut maxx, mut miny, mut maxy) = (f64::MAX, f64::MIN, f64::MAX, f64::MIN);
    for p in pts {
        if p.x < minx {
            minx = p.x;
        }
        if p.x > maxx {
            maxx = p.x;
        }
        if p.y < miny {
            miny = p.y;
        }
        if p.y > maxy {
            maxy = p.y;
        }
    }
    (minx, maxx, miny, maxy)
}

/// Fit an arbitrary bounding-box path into the table, preserving aspect ratio.
pub fn fit_to_table(pts: &[Pt], margin_frac: f64) -> Vec<Pt> {
    if pts.is_empty() {
        return vec![];
    }
    let (minx, maxx, miny, maxy) = bbox(pts);
    let src_w = (maxx - minx).max(1e-9);
    let src_h = (maxy - miny).max(1e-9);

    let avail_w = table_w() * (1.0 - margin_frac * 2.0);
    let avail_h = table_h() * (1.0 - margin_frac * 2.0);
    let scale = (avail_w / src_w).min(avail_h / src_h);

    let cx = (minx + maxx) / 2.0;
    let cy = (miny + maxy) / 2.0;
    let (tcx, tcy) = (table_cx(), table_cy());

    pts.iter()
        .map(|p| Pt::new(tcx + (p.x - cx) * scale, tcy + (p.y - cy) * scale))
        .collect()
}

/// Fit a path into the table, stretching x/y independently to cover the full
/// rectangle. Distorts shape proportions, so only use where full-area coverage
/// matters more than aspect fidelity (e.g. grid-fill erasers).
pub fn fit_to_table_stretch(pts: &[Pt], margin_frac: f64) -> Vec<Pt> {
    if pts.is_empty() {
        return vec![];
    }
    let (minx, maxx, miny, maxy) = bbox(pts);
    let src_w = (maxx - minx).max(1e-9);
    let src_h = (maxy - miny).max(1e-9);

    let avail_w = table_w() * (1.0 - margin_frac * 2.0);
    let avail_h = table_h() * (1.0 - margin_frac * 2.0);
    let sx = avail_w / src_w;
    let sy = avail_h / src_h;

    let cx = (minx + maxx) / 2.0;
    let cy = (miny + maxy) / 2.0;
    let (tcx, tcy) = (table_cx(), table_cy());

    pts.iter()
        .map(|p| Pt::new(tcx + (p.x - cx) * sx, tcy + (p.y - cy) * sy))
        .collect()
}

/// Douglas-Peucker polyline simplification. `epsilon` is in the same units as coordinates (mm).
pub fn douglas_peucker(pts: &[Pt], epsilon: f64) -> Vec<Pt> {
    if pts.len() < 3 {
        return pts.to_vec();
    }
    let start = pts[0];
    let end = *pts.last().unwrap();
    let mut max_dist = 0.0f64;
    let mut max_idx = 0;
    for (i, pt) in pts[1..pts.len() - 1].iter().enumerate() {
        let d = perp_dist(pt, &start, &end);
        if d > max_dist {
            max_dist = d;
            max_idx = i + 1;
        }
    }
    if max_dist > epsilon {
        let mut left = douglas_peucker(&pts[..=max_idx], epsilon);
        let right = douglas_peucker(&pts[max_idx..], epsilon);
        left.pop();
        left.extend(right);
        left
    } else {
        vec![start, end]
    }
}

fn perp_dist(pt: &Pt, a: &Pt, b: &Pt) -> f64 {
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    let len = (dx * dx + dy * dy).sqrt();
    if len < 1e-10 {
        return pt.dist2(a).sqrt();
    }
    ((dy * pt.x - dx * pt.y + b.x * a.y - b.y * a.x) / len).abs()
}

/// Remove consecutive near-duplicate points (within `tol` mm).
pub fn deduplicate(pts: &[Pt], tol: f64) -> Vec<Pt> {
    let tol2 = tol * tol;
    let mut out: Vec<Pt> = Vec::with_capacity(pts.len());
    for &p in pts {
        if out.last().is_none_or(|last: &Pt| last.dist2(&p) > tol2) {
            out.push(p);
        }
    }
    out
}

/// Parse G1 moves out of a G-code string.
pub fn parse_gcode_pts(gcode: &str) -> Vec<Pt> {
    let mut pts = Vec::new();
    for line in gcode.lines() {
        let line = line.trim();
        if !line.starts_with("G1") || line.starts_with("G1F") {
            continue;
        }
        let mut x: Option<f64> = None;
        let mut y: Option<f64> = None;
        for tok in line.split_whitespace() {
            if let Some(v) = tok.strip_prefix('X') {
                x = v.parse().ok();
            }
            if let Some(v) = tok.strip_prefix('Y') {
                y = v.parse().ok();
            }
        }
        if let (Some(x), Some(y)) = (x, y) {
            pts.push(Pt::new(x, y));
        }
    }
    pts
}

pub fn write_gcode(name: &str, pts: &[Pt], feedrate: u32) -> anyhow::Result<String> {
    let mut out = String::new();
    writeln!(out, ";")?;
    writeln!(out, "; File name: '{name}'")?;
    writeln!(out, "; File type: gcode")?;
    writeln!(out, ";")?;
    writeln!(out, "; BEGIN PRE")?;
    writeln!(out, "G1F{feedrate}")?;
    writeln!(out, "; END PRE")?;
    writeln!(out)?;
    for p in pts {
        writeln!(out, "G1 X{:.3} Y{:.3}", p.x, p.y)?;
    }
    Ok(out)
}
