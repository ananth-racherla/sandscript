# Sandscript

A pattern generator for a DIY kinetic sand table — the kind with a steel ball
dragged through sand by a magnet on an X/Y gantry, drawing one continuous line
that never lifts the pen. This is the tool that designs what the ball draws.

## Why this exists

Most sand-table software assumes you're sending a finished G-code file and
hoping for the best. I wanted something that felt more like a sketchbook:
pick a shape from a gallery, tweak a few sliders, watch it draw on screen
before committing a table's worth of sand to it, and send it straight to the
printer over OctoPrint when it looks right. The preview also tries to be
honest about the physical process — the ball has a real diameter and real
momentum, so a razor-thin line on screen that snaps around hairpin corners
would be lying to you about what the table will actually draw.

## Quick start

```
wasm-pack build --target web    # builds pkg/ from src/
python3 -m http.server 8080     # serve the app
```

Then open `http://localhost:8080`. No other build step, no npm — `index.html`
is the entire frontend.

## What's in it

- **Gallery** — curated presets (flowers, spirograph, fractals, erasers, and
  a couple of hand-picked animal outlines) grouped by category. Click one and
  it draws.
- **Custom** — the same pattern families with every parameter exposed as a
  slider, for building your own.
- **Print** — connects to OctoPrint, shows live table/temperature status,
  queues jobs, and previews what's currently drawing.
- **Table settings** (top of the preview panel) — actual table dimensions,
  groove width, and corner rounding, so the on-screen preview matches what
  the ball really leaves in the sand rather than an idealized thin line.

## How it's built

- `src/` — a Rust crate that generates the actual patterns (math curves,
  L-system fractals, SVG import, table-fitting math), compiled to WASM via
  `wasm-bindgen` and also usable as a native CLI (`cargo run --release --
  pattern rose --n 5 -o rose.gcode`).
- `index.html` — the whole frontend: canvas preview, gallery, OctoPrint
  client. One file, plain JS modules, no framework.
- `animals/` — a couple of hand-picked G-code files (a labrador, a turtle)
  used as gallery presets alongside the generated patterns.

## Table specifics

Default working area is 515×320mm, calibrated to my table, but it's
adjustable from the preview panel and every generator reads that setting —
nothing is hardcoded to one physical size.
