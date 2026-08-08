use anyhow::{bail, Context, Result};
use kurbo::{BezPath, ParamCurve, PathEl, Shape};
use roxmltree::Document;
use crate::gcode::Pt;

/// Parse an SVG file and return all paths sampled into polylines.
pub fn parse_svg(svg_text: &str, samples_per_unit: f64) -> Result<Vec<Vec<Pt>>> {
    let doc = Document::parse(svg_text).context("SVG parse error")?;
    let mut segments: Vec<Vec<Pt>> = Vec::new();
    collect_paths(doc.root_element(), &mut segments, samples_per_unit)?;
    if segments.is_empty() {
        bail!("No path elements found in SVG");
    }
    Ok(segments)
}

fn collect_paths(node: roxmltree::Node, out: &mut Vec<Vec<Pt>>, spu: f64) -> Result<()> {
    if node.tag_name().name() == "path" {
        if let Some(d) = node.attribute("d") {
            if !d.trim().is_empty() {
                match BezPath::from_svg(d) {
                    Ok(bez) => {
                        let segs = sample_bezpath(&bez, spu);
                        out.extend(segs);
                    }
                    Err(e) => {
                        eprintln!("Warning: skipping path ({e})");
                    }
                }
            }
        }
    }
    for child in node.children() {
        collect_paths(child, out, spu)?;
    }
    Ok(())
}

/// Sample a BezPath into one or more polylines (split at Move commands).
fn sample_bezpath(path: &BezPath, spu: f64) -> Vec<Vec<Pt>> {
    let mut result: Vec<Vec<Pt>> = Vec::new();
    let mut current: Vec<Pt> = Vec::new();
    let mut cursor = kurbo::Point::ZERO;
    let mut subpath_start = kurbo::Point::ZERO;

    for el in path.elements() {
        match el {
            PathEl::MoveTo(p) => {
                if current.len() >= 2 {
                    result.push(std::mem::take(&mut current));
                } else {
                    current.clear();
                }
                cursor = *p;
                subpath_start = *p;
                current.push(Pt::new(p.x, p.y));
            }
            PathEl::LineTo(p) => {
                cursor = *p;
                current.push(Pt::new(p.x, p.y));
            }
            PathEl::QuadTo(c, p) => {
                let seg = kurbo::QuadBez::new(cursor, *c, *p);
                sample_quad(&seg, &mut current, spu);
                cursor = *p;
            }
            PathEl::CurveTo(c1, c2, p) => {
                let seg = kurbo::CubicBez::new(cursor, *c1, *c2, *p);
                sample_cubic(&seg, &mut current, spu);
                cursor = *p;
            }
            PathEl::ClosePath => {
                if (cursor - subpath_start).hypot() > 1e-6 {
                    current.push(Pt::new(subpath_start.x, subpath_start.y));
                }
                cursor = subpath_start;
                if current.len() >= 2 {
                    result.push(std::mem::take(&mut current));
                }
            }
        }
    }
    if current.len() >= 2 {
        result.push(current);
    }
    result
}

fn sample_cubic(seg: &kurbo::CubicBez, out: &mut Vec<Pt>, spu: f64) {
    let len = seg.perimeter(1e-3);
    let n = ((len * spu).ceil() as usize).max(2);
    for i in 1..=n {
        let t = i as f64 / n as f64;
        let p = seg.eval(t);
        out.push(Pt::new(p.x, p.y));
    }
}

fn sample_quad(seg: &kurbo::QuadBez, out: &mut Vec<Pt>, spu: f64) {
    let len = seg.perimeter(1e-3);
    let n = ((len * spu).ceil() as usize).max(2);
    for i in 1..=n {
        let t = i as f64 / n as f64;
        let p = seg.eval(t);
        out.push(Pt::new(p.x, p.y));
    }
}

/// Stitch disconnected path segments into one continuous path using
/// greedy nearest-neighbor (each segment can be reversed).
pub fn stitch(mut segments: Vec<Vec<Pt>>) -> Vec<Pt> {
    if segments.is_empty() {
        return vec![];
    }
    let mut result: Vec<Pt> = Vec::new();
    let first = segments.remove(0);
    let mut current_end = *first.last().unwrap();
    result.extend(first);

    while !segments.is_empty() {
        let mut best_idx = 0;
        let mut best_dist = f64::MAX;
        let mut best_reverse = false;

        for (i, seg) in segments.iter().enumerate() {
            let d_start = current_end.dist2(seg.first().unwrap());
            let d_end   = current_end.dist2(seg.last().unwrap());
            if d_start < best_dist {
                best_dist = d_start;
                best_idx = i;
                best_reverse = false;
            }
            if d_end < best_dist {
                best_dist = d_end;
                best_idx = i;
                best_reverse = true;
            }
        }

        let mut seg = segments.remove(best_idx);
        if best_reverse {
            seg.reverse();
        }
        current_end = *seg.last().unwrap();
        result.extend(seg);
    }
    result
}
