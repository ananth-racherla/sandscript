import { useCallback, useState } from 'react';
import { PRESETS, buildGcodeFromPreset, type Preset } from '../../patterns/presets';
import { usePatternStore } from '../../store/patternStore';
import { useTableStore } from '../../store/tableStore';
import { useDraftValue } from '../../hooks/useDraftValue';
import { track } from '../../lib/analytics';
import { PresetCard } from './PresetCard';
import { SubmitPatternModal } from './SubmitPatternModal';

const CATEGORIES = [...new Set(PRESETS.map((p) => p.cat))];

export function GalleryPanel() {
  const gallerySelection = usePatternStore((s) => s.gallerySelection);
  const setGallerySelection = usePatternStore((s) => s.setGallerySelection);
  const [submitOpen, setSubmitOpen] = useState(false);

  // Reads gallerySelection fresh via getState() every time it runs (rather
  // than closing over a specific preset/sym) so that once registered as
  // patternStore.regenerateActive, a later table resize always regenerates
  // whatever is *currently* selected, not whatever was selected at
  // registration time.
  const regenerateFromSelection = useCallback(async () => {
    const sel = usePatternStore.getState().gallerySelection;
    if (!sel) return;
    const preset = PRESETS.find((p) => p.name === sel.presetName);
    if (!preset) return;
    const table = useTableStore.getState().table;
    try {
      const gcode = await buildGcodeFromPreset(preset, sel.sym, table);
      usePatternStore.getState().loadPattern(gcode, `${preset.name}.gcode`, 'gallery');
    } catch (e) {
      console.error(e);
    }
  }, []);

  // Only claims ownership of patternStore.regenerateActive at the moment it
  // actually generates a pattern (preset click / sym commit) — never on
  // mount. Registering unconditionally on mount would let this panel steal
  // "who regenerates on table resize" from Custom just by being the last
  // tab navigated to, even if Custom's pattern is the one currently shown.
  async function selectPreset(preset: Preset) {
    track('gallery_item_selected', { preset: preset.name });
    setGallerySelection({ presetName: preset.name, sym: preset.sym ?? 1 });
    usePatternStore.getState().setRegenerator(regenerateFromSelection);
    await regenerateFromSelection();
  }

  const [symDraft, setSymDraft] = useDraftValue(gallerySelection?.sym ?? 1);

  async function commitSym(sym: number) {
    if (!gallerySelection) return;
    setGallerySelection({ ...gallerySelection, sym });
    usePatternStore.getState().setRegenerator(regenerateFromSelection);
    await regenerateFromSelection();
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-2.5 pb-1">
        {CATEGORIES.map((cat) => (
          <div key={cat}>
            <div className="px-1 pb-1.5 pt-2.5 text-[0.65rem] uppercase tracking-[0.12em] text-ink-faint first:pt-0.5">{cat}</div>
            <div className="mb-0.5 grid grid-cols-2 gap-1.5">
              {PRESETS.filter((p) => p.cat === cat).map((preset) => (
                <PresetCard
                  key={preset.name}
                  preset={preset}
                  active={gallerySelection?.presetName === preset.name}
                  onClick={() => selectPreset(preset)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-panel-border px-2.5 py-2.5">
        <div className="flex items-center gap-2 text-[0.72rem] text-ink-muted">
          <label>Rotational copies</label>
          <input
            type="range"
            min={1}
            max={8}
            step={1}
            value={symDraft}
            disabled={!gallerySelection}
            className="w-[90px] accent-accent"
            onChange={(e) => setSymDraft(Number(e.target.value))}
            onMouseUp={(e) => commitSym(Number(e.currentTarget.value))}
            onTouchEnd={(e) => commitSym(Number(e.currentTarget.value))}
            onKeyUp={(e) => commitSym(Number(e.currentTarget.value))}
          />
          <span className="text-accent">{symDraft}</span>
        </div>
        <div className="mt-1 text-[0.66rem] leading-snug text-ink-muted">
          Repeats the selected pattern N times evenly around the center, like a kaleidoscope. Updates the pattern above as you move
          it.
        </div>
        <button
          onClick={() => {
            track('submit_pattern_clicked');
            setSubmitOpen(true);
          }}
          className="mt-2.5 block w-full text-center text-[0.7rem] text-accent hover:underline"
        >
          + Submit a pattern
        </button>
      </div>
      {submitOpen && <SubmitPatternModal onClose={() => setSubmitOpen(false)} />}
    </div>
  );
}
