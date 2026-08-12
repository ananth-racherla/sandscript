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
    dig_radius: f32,
    dig_strength: f32,
    relax_rate: f32,
    _pad: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> height_in: array<f32>;
@group(0) @binding(2) var<storage, read_write> height_out: array<f32>;

fn idx(x: i32, y: i32) -> u32 {
    let cx = clamp(x, 0, i32(params.grid_w) - 1);
    let cy = clamp(y, 0, i32(params.grid_h) - 1);
    return u32(cy) * params.grid_w + u32(cx);
}

// Pass 1: carve a soft groove into height_in wherever the ball currently is.
// In-place (reads and writes the same buffer) since each cell only depends
// on its own value + the ball's uniform position, not on neighbors.
@compute @workgroup_size(8, 8)
fn dig(@builtin(global_invocation_id) gid: vec3<u32>) {
    if (gid.x >= params.grid_w || gid.y >= params.grid_h) {
        return;
    }
    let i = gid.y * params.grid_w + gid.x;
    let dx = f32(gid.x) - params.ball_x;
    let dy = f32(gid.y) - params.ball_y;
    let d = sqrt(dx * dx + dy * dy);
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

    // Surface normal from finite differences of the heightmap.
    let normal = normalize(vec3<f32>(hl - hr, hu - hd, 2.0));
    let light_dir = normalize(vec3<f32>(0.5, 0.7, 0.6));
    let diffuse = max(dot(normal, light_dir), 0.0);

    // Warm sand base color, darkened inside grooves (negative height) so
    // dug lines read as depressions, plus a tight specular term so grains
    // along groove edges catch a highlight like real raked sand. h is <=0
    // in a groove and 0 on flat sand, so the mix factor must *increase*
    // with h (a positive coefficient) to go dark as h goes negative --
    // the previous negative coefficient did the opposite, making dug
    // grooves render *lighter* than the surrounding flat sand (the
    // "puff of smoke" bug).
    let h = sample_height(in.uv);
    let base = mix(vec3<f32>(0.30, 0.22, 0.12), vec3<f32>(0.62, 0.50, 0.30), clamp(h * 0.6 + 0.5, 0.0, 1.0));
    let half_dir = normalize(light_dir + vec3<f32>(0.0, 0.0, 1.0));
    let spec = pow(max(dot(normal, half_dir), 0.0), 24.0);

    var color = base * (0.35 + 0.65 * diffuse) + vec3<f32>(1.0, 0.95, 0.8) * spec * 0.5;
    let grain = hash21(in.pos.xy);
    color *= 0.9 + 0.2 * grain;
    return vec4<f32>(color, 1.0);
}
