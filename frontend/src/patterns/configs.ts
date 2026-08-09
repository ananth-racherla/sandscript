/** Schema for the Custom tab's 10 near-identical parameter forms — one
 * PatternConfig + <ParamForm> renders all of them instead of 10 hand-written
 * components. Generation itself stays an explicit switch in generate.ts
 * (not derived from this schema) since a couple of types (SVG) need
 * genuinely different logic (async file read) that isn't worth abstracting. */

export type ParamFormat = 'int' | 'float2' | 'float3' | 'float2pi';

export type ParamSpec =
  | { kind: 'slider'; key: string; label: string; min: number; max: number; step: number; default: number; hint?: string; format?: ParamFormat }
  | { kind: 'number'; key: string; label: string; min?: number; max?: number; default: number; hint?: string }
  | { kind: 'select'; key: string; label: string; options: { value: string; label: string; hint?: string }[]; default: string }
  | { kind: 'toggle'; key: string; label: string; options: { value: string; label: string }[]; default: string }
  | { kind: 'file'; key: string; label: string; accept: string; hint?: string }
  | { kind: 'checkbox'; key: string; label: string; default: boolean; hint?: string }
  | { kind: 'icon-toggle'; key: string; label: string; icon: 'flip-horizontal' | 'flip-vertical'; default: boolean; hint?: string };

export interface PatternConfig {
  id: string;
  label: string;
  /** Static description shown above the params — for types with no (or
   * barely any) tunable parameters, like Butterfly and Raster. */
  note?: string;
  params: ParamSpec[];
  /** Resolved per §6 of the plan: the old app only wired rotational
   * symmetry for 6 of 10 Custom types (spiral/flowfield/raster/svg
   * silently ignored it, unlike Gallery which applies it uniformly).
   * Every type supports it here, matching Gallery. */
  supportsSymmetry: boolean;
}

const LS_OPTIONS = [
  { value: 'koch', label: '❄️ Snowflake (Koch)', hint: 'Traces the outline of a Koch snowflake — a triangle whose edges are recursively notched into smaller triangles.' },
  { value: 'sierpinski', label: '△ Triangle (Sierpinski)', hint: 'A triangle subdivided into smaller triangles, with the middle removed each time.' },
  { value: 'plant', label: '🌿 Fern (branching plant)', hint: 'A branching fractal that looks like a fern or leafy plant. The branches are asymmetric by design.' },
  { value: 'dragon', label: '🐉 Dragon Wing', hint: 'Created by folding a strip of paper in half repeatedly. Gets more elaborate with each fold.' },
  { value: 'gosper', label: '⬡ Gosper Island', hint: 'A space-filling curve shaped like an irregular hexagon. Looks like a solid blob at high depth.' },
  { value: 'hilbert', label: '⊞ Space Fill (Hilbert)', hint: 'A space-filling curve that visits every point in a square grid. Looks like a maze at high depth. Great for erasing old patterns.' },
];

export const PATTERN_CONFIGS: PatternConfig[] = [
  {
    id: 'rose',
    label: 'Petal Rose',
    supportsSymmetry: true,
    params: [
      { kind: 'slider', key: 'n', label: 'Petals (N)', min: 1, max: 20, step: 1, default: 5, hint: 'Odd → N petals · Even → 2N petals' },
      { kind: 'slider', key: 'd', label: 'Fraction (D) — k = N/D', min: 1, max: 9, step: 1, default: 1, hint: 'D=1 → simple petals · D=2,3 → intricate crossing curves' },
      { kind: 'slider', key: 'scale', label: 'Size', min: 0.2, max: 1.0, step: 0.05, default: 0.9, format: 'float2' },
    ],
  },
  {
    id: 'maurer',
    label: 'Web Rose',
    supportsSymmetry: true,
    params: [
      { kind: 'slider', key: 'n', label: 'Petal frequency (N)', min: 2, max: 12, step: 1, default: 5 },
      { kind: 'slider', key: 'd', label: 'Step angle (D°)', min: 1, max: 180, step: 1, default: 97, hint: 'Try: N=5 D=97, N=6 D=71, N=4 D=77, N=7 D=19 — each is completely different' },
      { kind: 'slider', key: 'scale', label: 'Size', min: 0.2, max: 1.0, step: 0.05, default: 0.9, format: 'float2' },
    ],
  },
  {
    id: 'spirograph',
    label: 'Spirograph',
    supportsSymmetry: true,
    params: [
      {
        kind: 'toggle',
        key: 'mode',
        label: 'Mode',
        default: 'hypo',
        options: [
          { value: 'hypo', label: 'Classic (inner ring)' },
          { value: 'epi', label: 'Flower (outer ring)' },
        ],
      },
      { kind: 'slider', key: 'R', label: 'Outer circle R', min: 1, max: 20, step: 0.5, default: 5, format: 'float2' },
      { kind: 'slider', key: 'r', label: 'Rolling circle r', min: 0.5, max: 15, step: 0.5, default: 3, format: 'float2', hint: 'R/r ratio controls the number of spokes' },
      { kind: 'slider', key: 'd', label: 'Pen distance d', min: 0, max: 20, step: 0.5, default: 5, format: 'float2', hint: 'd=r → sharp star points · d<r → rounded loops' },
      { kind: 'slider', key: 'scale', label: 'Size', min: 0.2, max: 1.0, step: 0.05, default: 0.9, format: 'float2' },
    ],
  },
  {
    id: 'lissajous',
    label: 'Knot Curves',
    supportsSymmetry: true,
    params: [
      { kind: 'slider', key: 'a', label: 'Horizontal loops (A)', min: 1, max: 15, step: 1, default: 3 },
      { kind: 'slider', key: 'b', label: 'Vertical loops (B)', min: 1, max: 15, step: 1, default: 2, hint: 'A:B ratio determines the knot shape. Try 3:2, 5:4, 7:6' },
      { kind: 'slider', key: 'delta', label: 'Phase shift', min: 0, max: 2, step: 0.05, default: 0.5, format: 'float2pi', hint: 'Changes whether curves cross or touch at the edges' },
      { kind: 'slider', key: 'scale', label: 'Size', min: 0.2, max: 1.0, step: 0.05, default: 0.9, format: 'float2' },
    ],
  },
  {
    id: 'spiral',
    label: 'Spiral Fill',
    supportsSymmetry: true,
    params: [
      { kind: 'slider', key: 'turns', label: 'Number of turns', min: 5, max: 100, step: 1, default: 40, hint: 'More turns = denser fill. 50+ looks like a vinyl record groove.' },
      { kind: 'slider', key: 'gap', label: 'Gap between rings', min: 0.005, max: 0.1, step: 0.005, default: 0.025, format: 'float3' },
      { kind: 'slider', key: 'scale', label: 'Size', min: 0.2, max: 1.0, step: 0.05, default: 0.9, format: 'float2' },
    ],
  },
  {
    id: 'lsystem',
    label: 'Fractals',
    supportsSymmetry: true,
    params: [
      { kind: 'select', key: 'preset', label: 'Pattern type', default: 'koch', options: LS_OPTIONS },
      { kind: 'slider', key: 'depth', label: 'Detail level', min: 1, max: 7, step: 1, default: 4, hint: 'Higher = more detail but takes longer. Stay ≤5 for speed.' },
      { kind: 'slider', key: 'scale', label: 'Size', min: 0.2, max: 1.0, step: 0.05, default: 0.9, format: 'float2' },
    ],
  },
  {
    id: 'flowfield',
    label: 'Wind Swirls',
    supportsSymmetry: true,
    params: [
      { kind: 'number', key: 'seed', label: 'Seed (each number = new pattern)', min: 0, max: 99999, default: 42 },
      { kind: 'slider', key: 'particles', label: 'Number of streamlines', min: 20, max: 500, step: 10, default: 200 },
      { kind: 'slider', key: 'steps', label: 'Length of each streamline', min: 50, max: 1000, step: 10, default: 300 },
      { kind: 'slider', key: 'noiseScale', label: 'Noise scale', min: 0.5, max: 5, step: 0.1, default: 2.0, format: 'float2', hint: 'Low → long sweeping curves · High → tight swirls' },
      { kind: 'slider', key: 'strength', label: 'Turbulence', min: 0.5, max: 5, step: 0.1, default: 2.0, format: 'float2', hint: 'How sharply the wind bends the paths' },
      { kind: 'slider', key: 'scale', label: 'Size', min: 0.2, max: 1.0, step: 0.05, default: 0.9, format: 'float2' },
    ],
  },
  {
    id: 'butterfly',
    label: 'Butterfly',
    supportsSymmetry: true,
    note: 'The butterfly curve (r = e^sinθ − 2cos4θ − sin⁵(θ/12)) traces a pair of organic wings with four looping arms. No parameters — each run is the same beautiful shape.',
    params: [{ kind: 'slider', key: 'scale', label: 'Size', min: 0.3, max: 1.0, step: 0.05, default: 0.88, format: 'float2' }],
  },
  {
    id: 'raster',
    label: 'Raster Fill',
    supportsSymmetry: true,
    note: 'Back-and-forth horizontal lines covering the full table — the most reliable eraser. Leaves the sand in a clean, uniform raked finish.',
    params: [
      { kind: 'slider', key: 'rows', label: 'Number of rows', min: 20, max: 240, step: 4, default: 80, hint: '40 = fast coarse pass · 120 = thorough · 200 = very fine' },
      { kind: 'slider', key: 'margin', label: 'Border margin', min: 0, max: 0.08, step: 0.005, default: 0.01, format: 'float3' },
    ],
  },
  {
    id: 'svg',
    label: 'From SVG',
    supportsSymmetry: true,
    params: [
      { kind: 'file', key: 'svgFile', label: 'SVG outline file', accept: '.svg', hint: 'Single-stroke silhouettes work best. Search "animal silhouette svg" on thenounproject.com.' },
      { kind: 'slider', key: 'spu', label: 'Curve smoothness', min: 0.1, max: 5, step: 0.1, default: 0.5, format: 'float2', hint: 'Increase for SVGs with very small or tight curves' },
      { kind: 'slider', key: 'margin', label: 'Border margin', min: 0, max: 0.2, step: 0.01, default: 0.05, format: 'float2' },
      { kind: 'slider', key: 'minFeature', label: 'Drop small details', min: 0, max: 0.15, step: 0.005, default: 0, format: 'float3', hint: 'Skips isolated shapes smaller than this fraction of the whole drawing — useful for dropping a tiny eye/detail that otherwise costs an extra travel line to reach' },
      { kind: 'icon-toggle', key: 'flipHorizontal', label: 'Flip left / right', icon: 'flip-horizontal', default: false },
      { kind: 'icon-toggle', key: 'flipVertical', label: 'Flip top / bottom', icon: 'flip-vertical', default: false, hint: 'The correct orientation is already the default (SVGs are authored top-down; the table is bottom-up) — this flips it again, e.g. to mirror a design intentionally' },
    ],
  },
];

/** Builds the {key: default} map for one config, including `sym: 1` when
 * the type supports rotational symmetry — the single source of truth for
 * "what does a freshly-selected type's form start at." */
export function defaultValuesFor(config: PatternConfig): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const p of config.params) {
    values[p.key] = p.kind === 'file' ? null : p.default;
  }
  if (config.supportsSymmetry) values.sym = 1;
  return values;
}
