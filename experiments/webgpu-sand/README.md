# WebGPU reactive sand — feasibility spike

Standalone prototype answering one question: is a WebGPU compute-shader-based
"real sand grains reacting to the ball" surface feasible to build in this
codebase, using Rust's `wgpu` compiled to WASM (rather than hand-written JS
+ WebGL)? **Not wired into the main app** — this is a spike to evaluate the
approach, not a shippable feature. Nothing here is imported by `frontend/`.

## How it works

Two `f32` buffers (`height-a`/`height-b`) hold a flat 256×160 grid of "sand
depth" values, 0 = flat, negative = a dug groove. Each frame:

1. **`dig` compute pass** — carves a soft-edged groove into the current
   buffer wherever the ball is (a cosine falloff, not a hard-edged cylinder).
   Runs in place: each cell only depends on itself + the ball's position, no
   neighbor reads needed.
2. **`relax` compute pass** — blends each cell toward its 4-neighbor average
   by a small rate, approximating loose grains sliding back over time. This
   one genuinely needs each cell's *previous* neighbor values, so it
   ping-pongs between the two buffers rather than running in place.
3. **Render pass** — a fullscreen triangle whose fragment shader samples the
   heightmap, derives a surface normal from finite differences, and shades
   it with a fixed directional light (Lambertian + a tight specular term),
   so the groove visibly catches light the way a real raked sand surface
   does.

Rust owns the whole GPU pipeline (`src/lib.rs` + `src/sand.wgsl`), exposed to
JS as two functions: `init_sim(canvas) -> Promise<SandSim>` (async: requests
the adapter/device, configures the canvas surface) and `SandSim::{update,
render}` (called once per animation frame from `index.html`'s JS harness).

## What this demonstrates

- **`wgpu` compiles cleanly to `wasm32-unknown-unknown`** with only the
  `web`/`webgpu` backend features enabled (`cargo check` / release build
  both clean, no native-backend bloat pulled in).
- **The full pipeline runs against a real WebGPU context with zero
  validation errors** — bind group layouts, ping-pong buffer management,
  and the WGSL compute + render shaders are all structurally correct. This
  was verified live in Chromium (via `wasm-pack build --target web` +
  serving `index.html`), using Chromium's SwiftShader software WebGPU
  backend (`--enable-unsafe-webgpu --use-webgpu-adapter=swiftshader`),
  since this sandbox has no real GPU.
- **One real bug was caught and fixed in the process**: the initial `dig`
  pass bound the same buffer to two different writable storage slots (since
  it writes in place) — WebGPU's aliasing-hazard validation rejects that
  outright and silently drops the whole submission. Fixed by giving `dig`
  its own single-buffer bind group layout, distinct from `relax`'s
  two-buffer ping-pong layout. This is exactly the kind of real,
  WebGPU-specific correctness issue you'd only find by actually building
  the thing, not by reasoning about it in the abstract.

## What's *not* verified here

**Actual visual output.** Pixel-readback from the canvas (`createImageBitmap`
+ 2D copy) comes back fully transparent in this sandbox, in both headless
and headed-under-Xvfb Chromium, even though every render call reports
`Success`/`Suboptimal` and submits without error. This looks like a
SwiftShader-software-WebGPU-under-a-headless-container compositing
limitation, not a bug in the code — the GPU command stream is accepted and
executed without complaint, but doesn't reach a place a screenshot or pixel
readback can see it in this specific environment. Confirming the actual look
(does the lighting read as "sand," is the groove falloff pleasant, is the
relax rate tuned well) needs a real browser with a real GPU: open
`index.html` from a local server on your own machine.

## Running it locally

```
cd experiments/webgpu-sand
wasm-pack build --target web --out-dir pkg
python3 -m http.server 8000   # or any static file server
```

Open `http://localhost:8000/` in Chrome/Edge (desktop) or Safari 18+. The
ball auto-traces a Lissajous-ish path; move your mouse over the canvas to
steer it directly.

## Verdict: is it worth building for real?

**Yes, technically feasible, and the Rust/wgpu path is a good fit for this
codebase** — the simulation logic lives in Rust next to the existing
pattern-generation code, not scattered into JS, and the compiled WASM here
(~128KB) is smaller than the main app's existing WASM module (~240KB), so it
wouldn't meaningfully change the site's load weight.

The real cost is what was already flagged before building this: **browser
support**. WebGPU only reliably works on recent Chrome/Edge and Safari 18+;
there's no graceful WebGL fallback in this prototype, and building one would
roughly double the rendering code (a second, WebGL2-flavored render path,
since WebGL2 has no compute shaders — the `relax` pass would need to become
a fragment-shader ping-pong trick instead). For a free hobby site, "WebGPU
or nothing" is a real option worth deciding deliberately rather than
defaulting into, since visitors on older browsers or unsupported platforms
would see nothing at all rather than a degraded-but-working preview.

Given that, a reasonable next step if you want to move forward: keep the
existing 2D line-stroke `PreviewCanvas` as the universal fallback, and add
this as an **opt-in "fancy render" toggle** gated on `'gpu' in navigator` —
same pattern already used for `devicePixelRatio` awareness elsewhere in the
app, just gating on a bigger capability. That way nobody on an unsupported
browser loses anything, and the people who *do* get it get something worth
the build cost.
