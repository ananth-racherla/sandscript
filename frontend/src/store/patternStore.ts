import { create } from 'zustand';
import type { Pt } from '../lib/types';
import { parseGcode } from '../lib/gcode';
import { PATTERN_CONFIGS, defaultValuesFor } from '../patterns/configs';

export type ActiveSource = 'gallery' | 'custom' | 'dropped' | null;

interface PatternState {
  /** The exact G-code that would be downloaded/sent to print — never
   * touched by preview-only transforms (groove width, corner rounding). */
  currentGcode: string;
  currentName: string;
  /** Raw points parsed from currentGcode. PreviewCanvas derives its own
   * renderPts from this via useMemo — pts itself is never mutated for
   * rendering purposes. */
  pts: Pt[];
  activeSource: ActiveSource;
  /** Callback registered by whichever tab/hook is currently driving
   * generation (Gallery preset, Custom form, or a re-fit of a dropped
   * file). tableStore.setDims() calls this — together with pushing the
   * new dims to WASM — as one atomic action, so a table-size change can
   * never race a stale generation. Not meant to be read reactively by
   * components; accessed via getState() from outside React. */
  regenerateActive: (() => Promise<void>) | null;
  /** Which gallery preset (by name) is selected and its rotational-symmetry
   * slider value. Lives here — not GalleryPanel component state — so the
   * card highlight and slider position survive navigating to another tab
   * and back (GalleryPanel unmounts/remounts on route change; this store
   * doesn't). */
  gallerySelection: { presetName: string; sym: number } | null;
  /** Which Custom-tab pattern type is selected, and every type's current
   * param values (not just the active one) — the old single-page app never
   * unmounted the other 9 types' hidden panels, so switching type/tab and
   * back preserved whatever you'd tweaked. Keeping the full map here
   * (rather than CustomPanel component state, which would reset on route
   * unmount) reproduces that. */
  customType: string;
  customValues: Record<string, Record<string, unknown>>;
  loadPattern: (gcode: string, name: string, source: ActiveSource) => void;
  setRegenerator: (fn: (() => Promise<void>) | null) => void;
  setGallerySelection: (sel: { presetName: string; sym: number } | null) => void;
  setCustomType: (type: string) => void;
  setCustomParam: (type: string, key: string, value: unknown) => void;
}

export const usePatternStore = create<PatternState>((set) => ({
  currentGcode: '',
  currentName: '',
  pts: [],
  activeSource: null,
  regenerateActive: null,
  gallerySelection: null,
  customType: PATTERN_CONFIGS[0].id,
  customValues: Object.fromEntries(PATTERN_CONFIGS.map((c) => [c.id, defaultValuesFor(c)])),
  loadPattern: (gcode, name, source) => {
    set({ currentGcode: gcode, currentName: name, pts: parseGcode(gcode), activeSource: source });
  },
  setRegenerator: (fn) => set({ regenerateActive: fn }),
  setGallerySelection: (sel) => set({ gallerySelection: sel }),
  setCustomType: (type) => set({ customType: type }),
  setCustomParam: (type, key, value) =>
    set((s) => ({ customValues: { ...s.customValues, [type]: { ...s.customValues[type], [key]: value } } })),
}));
