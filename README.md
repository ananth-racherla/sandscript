# Sandscript

[![CI](https://github.com/ananth-racherla/sandscript/actions/workflows/ci.yml/badge.svg)](https://github.com/ananth-racherla/sandscript/actions/workflows/ci.yml)

**Live site: [sandscript.org](https://sandscript.org)**

A pattern generator for the Kinetic Sand Art Coffee Table.  Inspired by https://www.diymachines.co.uk/kinetic-sand-art-coffee-table-self-drawing

The goal for this project was to curate some patterns that well with the sandtable. And importantly allow the ability to preview the patterns.

The project also is designed to interact with a local Octoprint server via API. Connecting to local server requires an API key that can be obtained from the octoprint page by navigating to `Settings->API->Global API Key`


## Quick start

```
cd frontend
npm install
npm run dev
```

Then open `http://localhost:8080`. The dev server rebuilds the WASM crate automatically before starting (and before `npm run build`, too), so a fresh clone needs no manual `wasm-pack` step.

## Local development

**Prerequisites**
- Rust + the `wasm32-unknown-unknown` target (`rustup target add wasm32-unknown-unknown`)
- [`wasm-pack`](https://rustwasm.github.io/wasm-pack/installer/)
- Node.js + npm

**Making changes**
- Pattern generation, G-code writing, SVG import — edit the Rust crate in `src/`, then `npm run dev` (or `npm run wasm:build`) picks up the changes on the next reload.
- UI, routing, state, OctoPrint client — edit `frontend/src/`. Vite hot-reloads on save.

**Useful commands** (run from `frontend/`)
```
npm run dev       # start the dev server (rebuilds the WASM crate first)
npm run build     # type-check + production build to frontend/dist/
npm run preview   # serve the production build locally, to sanity-check it
npx tsc -b        # type-check only, no build
```

The Rust crate also runs standalone, outside the browser:
```
cargo run --release -- pattern rose --n 5 -o rose.gcode
cargo test
```

## Deploying (Cloudflare Workers)

The app deploys as a Cloudflare Workers static-assets site (`frontend/wrangler.jsonc`) — no server-side script, since everything runs client-side (React + WASM in the browser). Cloudflare's Git-connected Workers Builds don't have Rust/cargo/wasm-pack in their build image, so **`frontend/src/wasm/` (the compiled WASM output) is checked into git**, and the Cloudflare build uses `npm run build:deploy` instead of `npm run build` — same type-check + Vite build, just without the `wasm-pack` rebuild step that only works where Rust is installed.

**This means:** if you change anything under `src/` (the Rust crate), run `npm run wasm:build` from `frontend/` and commit the resulting changes in `frontend/src/wasm/` — otherwise the Cloudflare deploy will keep shipping the old compiled pattern logic even though the Rust source has moved on. `npm run dev` and `npm run build` (used for local work) always rebuild it fresh, so this only bites the deployed build if the rebuild isn't committed.

Cloudflare dashboard build settings (Settings → Build):
- **Root directory**: `frontend` (no leading slash)
- **Build command**: `npm run build:deploy`
- **Deploy command**: default (`npx wrangler deploy`)

# Key components
- `src/` — a Rust crate that generates the actual patterns (math curves,
  L-system fractals, SVG import, table-fitting math), compiled to WASM via
  `wasm-bindgen` and also usable as a native CLI (`cargo run --release --
  pattern rose --n 5 -o rose.gcode`).
- `frontend/` — the web app: React, TypeScript, Vite, TanStack Router/Query,
  Zustand, Tailwind CSS. Canvas preview, gallery, schema-driven custom-pattern
  forms, and the OctoPrint client all live here; see `frontend/src/`.
- `animals/` — a couple of hand-picked G-code files (a labrador, a turtle),
  copied into `frontend/public/animals/` and used as gallery presets
  alongside the generated patterns.

