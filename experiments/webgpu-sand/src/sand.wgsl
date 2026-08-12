// Heightmap-based reactive sand prototype.
//
// `height` is a flat GRID_W*GRID_H buffer of f32 "sand depth" values, 0 = flat
// surface, negative = a groove dug by the ball. Two copies (A/B) are
// ping-ponged for the relax pass since each cell there reads its neighbors.

struct Params {
    grid_w: u32,
    grid_h: u32,
    ball_x: f32,
    ball_y: f32,
    prev_ball_x: f32,
    prev_ball_y: f32,
    dig_radius: f32,
    dig_strength: f32,
    relax_rate: f32,
    _pad0: f32,
    _pad1: f32,
    _pad2: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> height_in: array<f32>;
@group(0) @binding(2) var<storage, read_write> height_out: array<f32>;

fn idx(x: i32, y: i32) -> u32 {
    let cx = clamp(x, 0, i32(params.grid_w) - 1);
    let cy = clamp(y, 0, i32(params.grid_h) - 1);
    return u32(cy) * params.grid_w + u32(cx);
}

// Shortest distance from p to the segment [a,b] -- used so a fast-moving
// ball digs a continuous stroke along wherever it traveled *this frame*,
// not just a stamp at its current position. Digging only the current point
// left gaps ("spray paint" dots) whenever the ball moved more than one dig
// radius between update() calls, which is the normal case at ordinary
// mouse/ball speeds since dig_radius is small relative to typical
// per-frame travel distance.
fn dist_to_segment(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
    let ab = b - a;
    let ab_len2 = dot(ab, ab);
    var t = 0.0;
    if (ab_len2 > 0.0001) {
        t = clamp(dot(p - a, ab) / ab_len2, 0.0, 1.0);
    }
    return distance(p, a + ab * t);
}

// Pass 1: carve a soft groove into height_in along the ball's path this
// frame. In-place (reads and writes the same buffer) since each cell only
// depends on its own value + the ball's segment, not on neighbors.
@compute @workgroup_size(8, 8)
fn dig(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x >= params.grid_w || gid.y >= params.grid_h) {
        return;
    }
    let i = gid.y * params.grid_w + gid.x;
    let p = vec2<f32>(f32(gid.x), f32(gid.y));
    let d = dist_to_segment(p, vec2<f32>(params.prev_ball_x, params.prev_ball_y), vec2<f32>(params.ball_x, params.ball_y));
    if (d < params.dig_radius) {
        // Smooth falloff (cosine bump) so the groove has soft shoulders
        // instead of a hard-edged cylinder.
        let falloff = 0.5 + 0.5 * cos(d / params.dig_radius * 3.14159265);
        let dug = height_in[i] - params.dig_strength * falloff;
        height_in[i] = max(dug, -params.dig_strength * 2.0);
    }
}

// Pass 2: each cell relaxes a little toward its neighbors' average --
// approximates loose grains settling/sliding back, without a full
// angle-of-repose erosion sim. Reads height_in, writes height_out (ping-pong)
// since this pass genuinely needs each cell's *previous* neighbor values.
@compute @workgroup_size(8, 8)
fn relax(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x >= params.grid_w || gid.y >= params.grid_h) {
        return;
    }
    let x = i32(gid.x);
    let y = i32(gid.y);
    let i = gid.y * params.grid_w + gid.x;
    let n = height_in[idx(x, y - 1)];
    let s = height_in[idx(x, y + 1)];
    let e = height_in[idx(x + 1, y)];
    let w = height_in[idx(x - 1, y)];
    let avg = (n + s + e + w) * 0.25;
    height_out[i] = mix(height_in[i], avg, params.relax_rate);
}

// -- render: fullscreen triangle, fragment samples the heightmap and shades
// it with a fixed directional light so grooves catch light like real sand.

struct VertexOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOut {
    // Fullscreen triangle trick: a triangle *twice* the size of the
    // viewport, so its hypotenuse falls entirely outside the visible
    // clip region and every pixel in the viewport is covered by one
    // single triangle face (get clipped down to the actual screen rect).
    // The previous version used a viewport-sized triangle instead of an
    // oversized one, which only covered half the canvas -- the visible
    // "light brown triangle" bug.
    var positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0),
    );
    var out: VertexOut;
    let p = positions[vi];
    out.pos = vec4<f32>(p, 0.0, 1.0);
    out.uv = vec2<f32>((p.x + 1.0) * 0.5, 1.0 - (p.y + 1.0) * 0.5);
    return out;
}

@group(0) @binding(0) var<uniform> render_params: Params;
@group(0) @binding(1) var<storage, read> height_render: array<f32>;

// Cheap per-pixel hash noise -- purely a function of screen position, so
// it's stable frame to frame (no flicker) without needing a texture asset.
// Used to dither the flat shaded gradient into something that reads as
// individual glinting grains rather than smooth plastic.
fn hash21(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.x, p.y, p.x) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

fn sample_height(uv: vec2<f32>) -> f32 {
    let gx = clamp(i32(uv.x * f32(render_params.grid_w)), 0, i32(render_params.grid_w) - 1);
    let gy = clamp(i32(uv.y * f32(render_params.grid_h)), 0, i32(render_params.grid_h) - 1);
    return height_render[u32(gy) * render_params.grid_w + u32(gx)];
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
    let texel = vec2<f32>(1.0 / f32(render_params.grid_w), 1.0 / f32(render_params.grid_h));
    let hl = sample_height(in.uv - vec2<f32>(texel.x, 0.0));
    let hr = sample_height(in.uv + vec2<f32>(texel.x, 0.0));
    let hu = sample_height(in.uv - vec2<f32>(0.0, texel.y));
    let hd = sample_height(in.uv + vec2<f32>(0.0, texel.y));
    let h = sample_height(in.uv);

    // Directional (Lambertian) shading alone is fundamentally ambiguous for
    // a smooth symmetric dip -- the exact same shading pattern reads as
    // either a groove or a raised ridge depending on which light direction
    // the viewer's brain assumes (the well-known "crater illusion"). That's
    // very likely why the groove still looked "out-dented" after only
    // fixing the color-mix sign: the directional cue was doing most of the
    // visual work and is inherently flippable.
    //
    // So depth here is carried primarily by two direction-*independent*
    // cues that can't be misread regardless of assumed lighting: (1) direct
    // darkening proportional to depth, and (2) slope-magnitude ambient
    // occlusion that darkens both edges of the groove equally. Directional
    // shading is kept, but as a minor accent on top, not the primary cue.
    let normal = normalize(vec3<f32>(hl - hr, hu - hd, 2.0));
    let light_dir = normalize(vec3<f32>(0.4, 0.55, 0.85));
    let diffuse = max(dot(normal, light_dir), 0.0);

    let sand_color = vec3<f32>(0.58, 0.46, 0.27);
    let groove_color = vec3<f32>(0.10, 0.07, 0.04);
    let depth_t = clamp(-h / 0.3, 0.0, 1.0); // 0 = flat sand, 1 = max dig depth
    var base = mix(sand_color, groove_color, depth_t);

    let slope = length(vec2<f32>(hl - hr, hu - hd));
    let ao = 1.0 - clamp(slope * 2.2, 0.0, 0.55);
    base *= ao;

    var color = base * (0.72 + 0.28 * diffuse);

    // Per-grain sparkle: a sparse scatter of small bright flecks (each grain
    // cell gets its own randomly-tilted micro-normal, and only ~10% of
    // cells catch the light at all), rather than one smooth ridge
    // highlight -- this is what makes individual grains read as distinct
    // instead of the surface looking like a flat sheet of MDF.
    let grain_cell = floor(in.pos.xy * 0.9);
    let grain_id = hash21(grain_cell);
    let tilt = vec2<f32>(hash21(grain_cell + vec2<f32>(1.7, 0.0)) - 0.5, hash21(grain_cell + vec2<f32>(0.0, 3.1)) - 0.5);
    let sparkle_normal = normalize(normal + vec3<f32>(tilt * 0.6, 0.0));
    let half_dir = normalize(light_dir + vec3<f32>(0.0, 0.0, 1.0));
    let spec = pow(max(dot(sparkle_normal, half_dir), 0.0), 40.0);
    let sparkle_mask = step(0.9, grain_id);
    color += vec3<f32>(1.0, 0.97, 0.85) * spec * sparkle_mask * 0.9;

    // Fine per-pixel dither everywhere (including flat sand) so the
    // background reads as countless individual grains rather than a
    // smooth gradient.
    let grain = hash21(in.pos.xy);
    color *= 0.88 + 0.24 * grain;

    return vec4<f32>(color, 1.0);
}
