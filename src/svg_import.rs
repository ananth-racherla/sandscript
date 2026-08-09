use crate::gcode::Pt;
use anyhow::{bail, Context, Result};
use kurbo::{BezPath, ParamCurve, PathEl, Shape};
use roxmltree::Document;
use std::borrow::Cow;
use std::f64::consts::PI;

/// Parse an SVG file and return all shapes sampled into polylines.
///
/// `min_feature_frac` drops shapes whose own bounding-box diagonal is
/// smaller than this fraction of the whole drawing's — small decorative
/// details (an eye on an otherwise-large silhouette) cost a full
/// pen-lift-and-travel round trip but barely register as a physical
/// feature at sand-table scale. 0 keeps everything.
///
/// `flip_horizontal`/`flip_vertical` mirror the result on top of the
/// automatic vertical correction described on `apply_flip`.
pub fn parse_svg(
    svg_text: &str,
    samples_per_unit: f64,
    min_feature_frac: f64,
    flip_horizontal: bool,
    flip_vertical: bool,
) -> Result<Vec<Vec<Pt>>> {
    let cleaned = strip_doctype(svg_text);
    let doc = Document::parse(&cleaned).context("SVG parse error")?;
    let mut segments: Vec<Vec<Pt>> = Vec::new();
    collect_shapes(doc.root_element(), &mut segments, samples_per_unit);
    if segments.is_empty() {
        bail!("No drawable shapes found in SVG");
    }
    segments = filter_tiny_shapes(segments, min_feature_frac);
    if segments.is_empty() {
        bail!("All shapes were smaller than the minimum feature size — try lowering it");
    }
    apply_flip(&mut segments, flip_horizontal, flip_vertical);
    Ok(segments)
}

fn bbox_diag(pts: &[Pt]) -> f64 {
    let (mut minx, mut maxx, mut miny, mut maxy) = (f64::MAX, f64::MIN, f64::MAX, f64::MIN);
    for p in pts {
        minx = minx.min(p.x);
        maxx = maxx.max(p.x);
        miny = miny.min(p.y);
        maxy = maxy.max(p.y);
    }
    ((maxx - minx).powi(2) + (maxy - miny).powi(2)).sqrt()
}

fn filter_tiny_shapes(segments: Vec<Vec<Pt>>, min_frac: f64) -> Vec<Vec<Pt>> {
    if min_frac <= 0.0 || segments.len() <= 1 {
        return segments;
    }
    let all_pts: Vec<Pt> = segments.iter().flatten().copied().collect();
    let overall_diag = bbox_diag(&all_pts);
    if overall_diag < 1e-9 {
        return segments;
    }
    segments
        .into_iter()
        .filter(|seg| bbox_diag(seg) / overall_diag >= min_frac)
        .collect()
}

/// SVG uses a Y-down coordinate system (origin top-left); the sand table
/// uses standard Y-up (origin bottom-left, see PreviewCanvas's t2c / the
/// table struct in gcode.rs), so copying coordinates as-is draws every
/// import upside down. Corrected here by default — `flip_vertical` flips
/// it again on top (for an intentional mirror), and `flip_horizontal` is a
/// plain optional left-right mirror with no inherent correction needed.
fn apply_flip(segments: &mut [Vec<Pt>], flip_horizontal: bool, flip_vertical: bool) {
    let sx = if flip_horizontal { -1.0 } else { 1.0 };
    let sy = if flip_vertical { 1.0 } else { -1.0 };
    for seg in segments.iter_mut() {
        for p in seg.iter_mut() {
            p.x *= sx;
            p.y *= sy;
        }
    }
}

/// Strips a leading `<!DOCTYPE ...>` declaration, if present. Most icon and
/// silhouette sites (svgrepo.com among them) stamp every export with the
/// old SVG 1.1 DOCTYPE boilerplate — irrelevant to us (we only walk the
/// element tree, never validate against it), but `roxmltree` refuses to
/// parse *any* document containing one at all ("XML with DTD detected"),
/// so it has to go before parsing rather than being handled as a parse
/// option. Scans by bracket depth rather than a plain substring search for
/// the closing `>`, since an internal subset (`<!DOCTYPE foo [ ... ]>`) can
/// itself contain `>` characters that don't end the declaration.
fn strip_doctype(svg_text: &str) -> Cow<'_, str> {
    let Some(start) = svg_text.find("<!DOCTYPE") else {
        return Cow::Borrowed(svg_text);
    };
    let bytes = svg_text.as_bytes();
    let mut i = start;
    let mut depth = 0i32;
    while i < bytes.len() {
        match bytes[i] {
            b'[' => depth += 1,
            b']' => depth -= 1,
            b'>' if depth <= 0 => {
                i += 1;
                break;
            }
            _ => {}
        }
        i += 1;
    }
    let mut out = String::with_capacity(svg_text.len());
    out.push_str(&svg_text[..start]);
    out.push_str(&svg_text[i..]);
    Cow::Owned(out)
}

fn collect_shapes(node: roxmltree::Node, out: &mut Vec<Vec<Pt>>, spu: f64) {
    match node.tag_name().name() {
        "path" => {
            if let Some(d) = node.attribute("d") {
                if !d.trim().is_empty() {
                    match BezPath::from_svg(d) {
                        Ok(bez) => out.extend(sample_bezpath(&bez, spu)),
                        Err(e) => eprintln!("Warning: skipping path ({e})"),
                    }
                }
            }
        }
        "circle" => {
            let cx = attr_f64(&node, "cx", 0.0);
            let cy = attr_f64(&node, "cy", 0.0);
            let r = attr_f64(&node, "r", 0.0);
            if r > 0.0 {
                out.push(sample_ellipse(cx, cy, r, r, spu));
            }
        }
        "ellipse" => {
            let cx = attr_f64(&node, "cx", 0.0);
            let cy = attr_f64(&node, "cy", 0.0);
            let rx = attr_f64(&node, "rx", 0.0);
            let ry = attr_f64(&node, "ry", 0.0);
            if rx > 0.0 && ry > 0.0 {
                out.push(sample_ellipse(cx, cy, rx, ry, spu));
            }
        }
        "rect" => {
            if let Some(pts) = sample_rect(&node, spu) {
                out.push(pts);
            }
        }
        "line" => {
            let x1 = attr_f64(&node, "x1", 0.0);
            let y1 = attr_f64(&node, "y1", 0.0);
            let x2 = attr_f64(&node, "x2", 0.0);
            let y2 = attr_f64(&node, "y2", 0.0);
            out.push(vec![Pt::new(x1, y1), Pt::new(x2, y2)]);
        }
        "polyline" | "polygon" => {
            if let Some(mut pts) = parse_points(node.attribute("points").unwrap_or("")) {
                if node.tag_name().name() == "polygon" && pts.len() >= 2 {
                    let first = pts[0];
                    pts.push(first);
                }
                if pts.len() >= 2 {
                    out.push(pts);
                }
            }
        }
        _ => {}
    }
    for child in node.children() {
        collect_shapes(child, out, spu);
    }
}

/// Reads a numeric attribute, tolerating a trailing CSS unit (`"12px"`,
/// `"3.5mm"`) since some SVG authoring tools emit those even though plain
/// unitless numbers are far more common in practice.
fn attr_f64(node: &roxmltree::Node, name: &str, default: f64) -> f64 {
    let Some(raw) = node.attribute(name) else {
        return default;
    };
    let numeric_end = raw
        .find(|c: char| {
            !(c.is_ascii_digit() || c == '.' || c == '-' || c == '+' || c == 'e' || c == 'E')
        })
        .unwrap_or(raw.len());
    raw[..numeric_end].parse().unwrap_or(default)
}

/// Parses a `points="x1,y1 x2,y2 ..."` list — commas and/or whitespace are
/// both valid separators per the SVG spec, and real files mix both freely.
fn parse_points(raw: &str) -> Option<Vec<Pt>> {
    let nums: Vec<f64> = raw
        .split([',', ' ', '\n', '\t', '\r'])
        .filter(|s| !s.is_empty())
        .filter_map(|s| s.parse().ok())
        .collect();
    if nums.len() < 4 {
        return None;
    }
    Some(nums.chunks_exact(2).map(|c| Pt::new(c[0], c[1])).collect())
}

fn sample_rect(node: &roxmltree::Node, spu: f64) -> Option<Vec<Pt>> {
    let x = attr_f64(node, "x", 0.0);
    let y = attr_f64(node, "y", 0.0);
    let w = attr_f64(node, "width", 0.0);
    let h = attr_f64(node, "height", 0.0);
    if w <= 0.0 || h <= 0.0 {
        return None;
    }
    let rx = attr_f64(node, "rx", 0.0).max(0.0).min(w / 2.0);
    let ry = attr_f64(node, "ry", rx).max(0.0).min(h / 2.0);

    if rx <= 0.0 || ry <= 0.0 {
        return Some(vec![
            Pt::new(x, y),
            Pt::new(x + w, y),
            Pt::new(x + w, y + h),
            Pt::new(x, y + h),
            Pt::new(x, y),
        ]);
    }

    // Rounded rect: four straight edges joined by quarter-ellipse arcs at
    // each corner, walked clockwise starting just right of the top-left
    // corner.
    let steps = quarter_arc_steps(rx, ry, spu);
    let mut pts = Vec::new();
    let corner = |cx: f64, cy: f64, a_start: f64, a_end: f64, pts: &mut Vec<Pt>| {
        for i in 0..=steps {
            let t = a_start + (a_end - a_start) * (i as f64 / steps as f64);
            pts.push(Pt::new(cx + rx * t.cos(), cy + ry * t.sin()));
        }
    };
    pts.push(Pt::new(x + rx, y));
    pts.push(Pt::new(x + w - rx, y));
    corner(x + w - rx, y + ry, -PI / 2.0, 0.0, &mut pts);
    pts.push(Pt::new(x + w, y + h - ry));
    corner(x + w - rx, y + h - ry, 0.0, PI / 2.0, &mut pts);
    pts.push(Pt::new(x + rx, y + h));
    corner(x + rx, y + h - ry, PI / 2.0, PI, &mut pts);
    pts.push(Pt::new(x, y + ry));
    corner(x + rx, y + ry, PI, 1.5 * PI, &mut pts);
    Some(pts)
}

fn quarter_arc_steps(rx: f64, ry: f64, spu: f64) -> usize {
    let quarter_len = 0.5 * PI * ((rx * rx + ry * ry) / 2.0).sqrt();
    ((quarter_len * spu).ceil() as usize).max(2)
}

fn sample_ellipse(cx: f64, cy: f64, rx: f64, ry: f64, spu: f64) -> Vec<Pt> {
    // Ramanujan's approximation — exact circumference isn't needed, just a
    // reasonable point-count estimate.
    let h = ((rx - ry) / (rx + ry)).powi(2);
    let circumference = PI * (rx + ry) * (1.0 + 3.0 * h / (10.0 + (4.0 - 3.0 * h).sqrt()));
    let n = ((circumference * spu).ceil() as usize).max(8);
    (0..=n)
        .map(|i| {
            let t = 2.0 * PI * (i as f64) / (n as f64);
            Pt::new(cx + rx * t.cos(), cy + ry * t.sin())
        })
        .collect()
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

/// Stitch disconnected path segments into one continuous path: build an
/// initial nearest-neighbor tour, then locally improve it with 2-opt.
///
/// Nearest-neighbor alone visits whichever segment is closest *right now*
/// with no lookahead — so a small detail segment that would have been a
/// short hop from partway through a big loop can end up needing a long
/// standalone jump once the loop's already finished somewhere else
/// entirely (the loop is drawn as one atomic unit; NN can't pause midway
/// through it to grab something nearby). 2-opt fixes the part of that
/// which reordering can fix — which segment ends up adjacent to which —
/// by repeatedly checking whether reversing a span of the tour shortens
/// total travel, same technique pen-plotter path optimizers use. It
/// can't split a segment to insert a mid-draw detour (nothing can, short
/// of ordering the SVG's own path data differently), so an isolated
/// detail can still cost one unavoidable jump — just the *cheapest*
/// available one instead of whatever NN happened to end on.
///
/// Segment counts in real SVGs are small (tens, not thousands), so both
/// passes are effectively instant.
pub fn stitch(segments: Vec<Vec<Pt>>) -> Vec<Pt> {
    if segments.is_empty() {
        return vec![];
    }
    if segments.len() == 1 {
        return segments.into_iter().next().unwrap();
    }

    let tour = nearest_neighbor_tour(&segments);
    let tour = two_opt(&segments, tour);
    let cuts = recut_closed_loops(&segments, &tour);

    let mut result = Vec::new();
    for (pos, entry) in tour.iter().enumerate() {
        let seg = &segments[entry.idx];
        if is_closed_loop(seg) {
            result.extend(rotate_closed_loop(seg, cuts[pos]));
        } else if entry.reversed {
            result.extend(seg.iter().rev().copied());
        } else {
            result.extend(seg.iter().copied());
        }
    }
    result
}

const CLOSED_LOOP_EPS: f64 = 1e-6;

/// True if this segment's own path data closed back on itself (an SVG
/// path ending in `Z`) — its start and end are the same point.
fn is_closed_loop(seg: &[Pt]) -> bool {
    seg.len() > 2 && seg[0].dist2(seg.last().unwrap()) < CLOSED_LOOP_EPS
}

/// Rotates a closed loop's points to start (and, closing the loop, end)
/// at index `cut` instead of wherever its SVG path data happened to start.
fn rotate_closed_loop(seg: &[Pt], cut: usize) -> Vec<Pt> {
    let unique_len = seg.len() - 1; // seg's last point duplicates seg[0]
    let cut = cut % unique_len;
    (0..=unique_len)
        .map(|i| seg[(cut + i) % unique_len])
        .collect()
}

/// The point used to connect the segment at `tour[pos]` to its neighbor —
/// its currently-chosen cut point if it's a closed loop (entering and
/// leaving a closed loop happen at the same physical point), otherwise
/// its ordinary fixed start/end.
fn tour_anchor(
    segments: &[Vec<Pt>],
    tour: &[TourEntry],
    cuts: &[usize],
    pos: usize,
    want_end: bool,
) -> Pt {
    let entry = tour[pos];
    let seg = &segments[entry.idx];
    if is_closed_loop(seg) {
        return seg[cuts[pos] % (seg.len() - 1)];
    }
    seg_endpoint(segments, entry, want_end)
}

/// A closed loop only exposes its SVG-authored starting point as a place
/// to enter/exit by default — but geometrically any point on its boundary
/// works just as well, and entering/leaving happen at the *same* physical
/// point either way (the ball has to return to wherever it started to
/// finish tracing a closed shape). This is the actual fix for a jump that
/// plain segment reordering (two_opt) can never remove: two_opt only ever
/// considers a segment's fixed endpoints, so when everything left to
/// connect is a closed loop, no reordering changes anything (confirmed by
/// testing against the dolphin SVG directly — two_opt found zero improving
/// moves once the eye was filtered out, because both remaining segments'
/// closed-loop paths only exposed one connection point each). Picks,
/// for each closed loop in the tour, whichever point on its boundary is
/// cheapest given its *actual* neighbors. A few passes let choices
/// propagate between adjacent loops, since one loop's chosen cut affects
/// what's cheapest for its neighbor.
fn recut_closed_loops(segments: &[Vec<Pt>], tour: &[TourEntry]) -> Vec<usize> {
    let n = tour.len();
    let mut cuts = vec![0usize; n];
    const PASSES: usize = 4;
    for _ in 0..PASSES {
        for pos in 0..n {
            let seg = &segments[tour[pos].idx];
            if !is_closed_loop(seg) {
                continue;
            }
            let prev = (pos > 0).then(|| tour_anchor(segments, tour, &cuts, pos - 1, true));
            let next = (pos + 1 < n).then(|| tour_anchor(segments, tour, &cuts, pos + 1, false));
            let unique_len = seg.len() - 1;
            let mut best_k = cuts[pos];
            let mut best_cost = f64::MAX;
            for (k, p) in seg.iter().take(unique_len).enumerate() {
                let cost = prev.map_or(0.0, |a| a.dist2(p).sqrt())
                    + next.map_or(0.0, |b| p.dist2(&b).sqrt());
                if cost < best_cost {
                    best_cost = cost;
                    best_k = k;
                }
            }
            cuts[pos] = best_k;
        }
    }
    cuts
}

#[derive(Clone, Copy)]
struct TourEntry {
    idx: usize,
    reversed: bool,
}

fn seg_endpoint(segments: &[Vec<Pt>], entry: TourEntry, end: bool) -> Pt {
    let seg = &segments[entry.idx];
    if end != entry.reversed {
        *seg.last().unwrap()
    } else {
        seg[0]
    }
}

fn nearest_neighbor_tour(segments: &[Vec<Pt>]) -> Vec<TourEntry> {
    let n = segments.len();
    let mut visited = vec![false; n];
    let mut tour = Vec::with_capacity(n);
    tour.push(TourEntry {
        idx: 0,
        reversed: false,
    });
    visited[0] = true;
    let mut current_end = *segments[0].last().unwrap();

    for _ in 1..n {
        let mut best_idx = 0;
        let mut best_dist = f64::MAX;
        let mut best_reversed = false;
        for (i, seg) in segments.iter().enumerate() {
            if visited[i] {
                continue;
            }
            let d_start = current_end.dist2(seg.first().unwrap());
            let d_end = current_end.dist2(seg.last().unwrap());
            if d_start < best_dist {
                best_dist = d_start;
                best_idx = i;
                best_reversed = false;
            }
            if d_end < best_dist {
                best_dist = d_end;
                best_idx = i;
                best_reversed = true;
            }
        }
        visited[best_idx] = true;
        current_end = if best_reversed {
            segments[best_idx][0]
        } else {
            *segments[best_idx].last().unwrap()
        };
        tour.push(TourEntry {
            idx: best_idx,
            reversed: best_reversed,
        });
    }
    tour
}

fn tour_cost(segments: &[Vec<Pt>], tour: &[TourEntry]) -> f64 {
    tour.windows(2)
        .map(|w| {
            let a = seg_endpoint(segments, w[0], true);
            let b = seg_endpoint(segments, w[1], false);
            a.dist2(&b).sqrt()
        })
        .sum()
}

/// Classic 2-opt adapted for reversible "cities" (each tour entry is a
/// whole segment that can be traversed in either direction): try reversing
/// every span [i+1..=j] — which also flips each entry's own orientation,
/// since walking a reversed span backwards means walking each segment in
/// it backwards too — and keep the single best-improving move per pass
/// until none improves, or a pass cap is hit.
fn two_opt(segments: &[Vec<Pt>], mut tour: Vec<TourEntry>) -> Vec<TourEntry> {
    let n = tour.len();
    if n < 3 {
        return tour;
    }
    const MAX_PASSES: usize = 30;
    for _ in 0..MAX_PASSES {
        let mut best_cost = tour_cost(segments, &tour);
        let mut best_move: Option<(usize, usize)> = None;
        for i in 0..n - 1 {
            for j in (i + 1)..n {
                let mut candidate = tour.clone();
                candidate[i + 1..=j].reverse();
                for entry in &mut candidate[i + 1..=j] {
                    entry.reversed = !entry.reversed;
                }
                let cost = tour_cost(segments, &candidate);
                if cost < best_cost - 1e-9 {
                    best_cost = cost;
                    best_move = Some((i, j));
                }
            }
        }
        match best_move {
            Some((i, j)) => {
                tour[i + 1..=j].reverse();
                for entry in &mut tour[i + 1..=j] {
                    entry.reversed = !entry.reversed;
                }
            }
            None => break,
        }
    }
    tour
}

#[cfg(test)]
mod tests {
    use super::*;

    // Reproduces the real-world bug: svgrepo.com (and most icon/silhouette
    // sites) stamp every export with the old SVG 1.1 DOCTYPE, which
    // roxmltree refuses to parse at all ("XML with DTD detected") even
    // though the declaration itself is irrelevant to us.
    const WITH_DOCTYPE: &str = r#"<?xml version="1.0"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">
<path d="M0 0 L10 0 L10 10 Z"/>
</svg>"#;

    #[test]
    fn strips_doctype_with_external_subset() {
        let cleaned = strip_doctype(WITH_DOCTYPE);
        assert!(!cleaned.contains("<!DOCTYPE"));
        assert!(cleaned.contains("<svg"));
        assert!(cleaned.contains("<path"));
    }

    #[test]
    fn parses_svg_with_doctype() {
        let result = parse_svg(WITH_DOCTYPE, 1.0, 0.0, false, false);
        assert!(result.is_ok(), "{:?}", result.err());
        assert!(!result.unwrap().is_empty());
    }

    #[test]
    fn strips_doctype_with_internal_subset_containing_gt() {
        // An internal subset can itself contain '>' characters (entity
        // declarations); a naive "find the next '>'" would truncate here.
        let svg = "<!DOCTYPE svg [ <!ENTITY foo \"a>b\"> ]>\n<svg xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M0 0 L1 1\"/></svg>";
        let cleaned = strip_doctype(svg);
        assert!(!cleaned.contains("<!DOCTYPE"));
        assert!(parse_svg(&cleaned, 1.0, 0.0, false, false).is_ok());
    }

    #[test]
    fn no_doctype_is_left_untouched() {
        let svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M0 0 L1 1\"/></svg>";
        assert_eq!(strip_doctype(svg), svg);
    }

    #[test]
    fn parses_circle() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="3"/></svg>"#;
        let segs = parse_svg(svg, 1.0, 0.0, false, false).unwrap();
        assert_eq!(segs.len(), 1);
        assert!(segs[0].len() > 8);
    }

    #[test]
    fn parses_rect_plain_and_rounded() {
        let plain = r#"<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="10" height="5"/></svg>"#;
        let segs = parse_svg(plain, 1.0, 0.0, false, false).unwrap();
        assert_eq!(segs[0].len(), 5); // 4 corners + closing point

        let rounded = r#"<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="10" height="5" rx="1" ry="1"/></svg>"#;
        let segs = parse_svg(rounded, 1.0, 0.0, false, false).unwrap();
        assert!(segs[0].len() > 5);
    }

    #[test]
    fn parses_polyline_and_polygon() {
        let polyline =
            r#"<svg xmlns="http://www.w3.org/2000/svg"><polyline points="0,0 5,5 10,0"/></svg>"#;
        let segs = parse_svg(polyline, 1.0, 0.0, false, false).unwrap();
        assert_eq!(segs[0].len(), 3);

        // polygon implicitly closes back to the first point
        let polygon =
            r#"<svg xmlns="http://www.w3.org/2000/svg"><polygon points="0,0 5,5 10,0"/></svg>"#;
        let segs = parse_svg(polygon, 1.0, 0.0, false, false).unwrap();
        assert_eq!(segs[0].len(), 4);
        assert_eq!((segs[0][0].x, segs[0][0].y), (segs[0][3].x, segs[0][3].y));
    }

    #[test]
    fn parses_line() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="0" x2="10" y2="10"/></svg>"#;
        let segs = parse_svg(svg, 1.0, 0.0, false, false).unwrap();
        assert_eq!(segs[0].len(), 2);
    }

    #[test]
    fn tolerates_unit_suffixes_on_numeric_attributes() {
        let svg =
            r#"<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5px" cy="5px" r="3px"/></svg>"#;
        let segs = parse_svg(svg, 1.0, 0.0, false, false).unwrap();
        assert!(!segs.is_empty());
    }

    #[test]
    fn shapes_nested_inside_groups_are_found() {
        let svg =
            r#"<svg xmlns="http://www.w3.org/2000/svg"><g><g><path d="M0 0 L1 1"/></g></g></svg>"#;
        assert!(parse_svg(svg, 1.0, 0.0, false, false).is_ok());
    }

    #[test]
    fn empty_svg_gives_clear_error_not_a_panic() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg"></svg>"#;
        let err = parse_svg(svg, 1.0, 0.0, false, false).unwrap_err();
        assert!(err.to_string().contains("No drawable shapes found"));
    }

    #[test]
    fn default_orientation_flips_y_to_match_the_table() {
        // SVG's Y-down origin means a point below-and-right of the origin
        // in source coordinates (positive x, positive y) must come out
        // with a *negated* y once corrected for the table's Y-up
        // convention — x is untouched by the default (no flip requested).
        let svg =
            r#"<svg xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="0" x2="3" y2="7"/></svg>"#;
        let segs = parse_svg(svg, 1.0, 0.0, false, false).unwrap();
        assert_eq!((segs[0][1].x, segs[0][1].y), (3.0, -7.0));
    }

    #[test]
    fn flip_vertical_cancels_the_default_correction() {
        let svg =
            r#"<svg xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="0" x2="3" y2="7"/></svg>"#;
        let segs = parse_svg(svg, 1.0, 0.0, false, true).unwrap();
        assert_eq!((segs[0][1].x, segs[0][1].y), (3.0, 7.0));
    }

    #[test]
    fn flip_horizontal_mirrors_x() {
        let svg =
            r#"<svg xmlns="http://www.w3.org/2000/svg"><line x1="0" y1="0" x2="3" y2="7"/></svg>"#;
        let segs = parse_svg(svg, 1.0, 1.0, true, false).unwrap();
        // min_feature_frac=1.0 is harmless here — there's only one segment,
        // and filter_tiny_shapes never drops the sole remaining segment.
        assert_eq!((segs[0][1].x, segs[0][1].y), (-3.0, -7.0));
    }

    #[test]
    fn min_feature_frac_drops_small_isolated_shapes() {
        // A tiny circle (diameter 2) next to a large one (diameter 200) —
        // the small one is ~1% of the combined bounding box's diagonal.
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg">
            <circle cx="0" cy="0" r="100"/>
            <circle cx="250" cy="0" r="1"/>
        </svg>"#;

        let kept_both = parse_svg(svg, 1.0, 0.0, false, false).unwrap();
        assert_eq!(kept_both.len(), 2);

        let dropped_small = parse_svg(svg, 1.0, 0.05, false, false).unwrap();
        assert_eq!(dropped_small.len(), 1);
    }

    #[test]
    fn min_feature_frac_too_aggressive_gives_clear_error() {
        // Two small circles, far apart — neither is individually large
        // relative to their combined bounding box, so a strict enough
        // threshold drops both, leaving nothing to draw.
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg">
            <circle cx="0" cy="0" r="1"/>
            <circle cx="200" cy="0" r="1"/>
        </svg>"#;
        let err = parse_svg(svg, 1.0, 0.5, false, false).unwrap_err();
        assert!(err
            .to_string()
            .contains("smaller than the minimum feature size"));
    }

    /// A square outline with `steps` points per edge, so edge-to-edge
    /// spacing is small enough that a real inter-segment jump stands out
    /// as the largest gap rather than getting lost among plain corners.
    fn dense_square(x0: f64, y0: f64, size: f64, steps: usize) -> Vec<Pt> {
        let corners = [
            (x0, y0),
            (x0 + size, y0),
            (x0 + size, y0 + size),
            (x0, y0 + size),
            (x0, y0),
        ];
        let mut out = Vec::new();
        for w in corners.windows(2) {
            let (ax, ay) = w[0];
            let (bx, by) = w[1];
            for i in 0..steps {
                let t = i as f64 / steps as f64;
                out.push(Pt::new(ax + (bx - ax) * t, ay + (by - ay) * t));
            }
        }
        out.push(Pt::new(corners[0].0, corners[0].1));
        out
    }

    #[test]
    fn recuts_closed_loops_to_their_nearest_points() {
        // A big square loop, densely sampled (~5-unit edge spacing), SVG-
        // authored to start at its far corner (0,0)...
        let big = dense_square(0.0, 0.0, 100.0, 20);
        // ...and a tiny loop tucked right next to big's (100,100) corner,
        // but SVG-authored to start at ITS far corner instead — naive
        // stitching (always connecting at each loop's fixed start) would
        // have to jump the long way around (~150 units); recutting should
        // find the ~5-unit-apart pair of adjacent corners instead.
        let small = dense_square(100.0, 105.0, 5.0, 4);
        let stitched = stitch(vec![big, small]);
        let max_gap = stitched
            .windows(2)
            .map(|w| w[0].dist2(&w[1]).sqrt())
            .fold(0.0, f64::max);
        assert!(max_gap < 10.0, "expected a short recut jump, got {max_gap}");
    }
}
