import { useCallback, useEffect, useRef, useState } from 'react';
import { PATTERN_CONFIGS } from '../../patterns/configs';
import { generateCustomGcode } from '../../patterns/generate';
import { usePatternStore } from '../../store/patternStore';
import { useTableStore } from '../../store/tableStore';
import { ParamForm } from './ParamForm';

const DEBOUNCE_MS = 300;

export function CustomPanel() {
  const customType = usePatternStore((s) => s.customType);
  const setCustomType = usePatternStore((s) => s.setCustomType);
  const customValues = usePatternStore((s) => s.customValues);
  const setCustomParam = usePatternStore((s) => s.setCustomParam);

  const config = PATTERN_CONFIGS.find((c) => c.id === customType)!;
  const values = customValues[customType];

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Returns whether generation succeeded, so the caller decides what to do
  // next (claim regenerateActive ownership) — kept out of this function's
  // own body so it isn't self-referencing itself before its `const` is
  // assigned.
  const regenerateFromCurrent = useCallback(async () => {
    const s = usePatternStore.getState();
    const type = s.customType;
    const currentValues = s.customValues[type];
    // SVG needs a file before there's anything to generate — quietly wait
    // rather than surfacing an error for a perfectly normal not-ready state.
    if (type === 'svg' && !currentValues.svgFile) {
      return false;
    }
    const table = useTableStore.getState().table;
    setGenerating(true);
    setError(null);
    try {
      const { gcode, name } = await generateCustomGcode(type, currentValues, table);
      usePatternStore.getState().loadPattern(gcode, name, 'custom');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setGenerating(false);
    }
  }, []);

  // Auto-regenerate whenever the active type or its param values change,
  // debounced so dragging a slider doesn't fire a wasm call on every tick
  // — same "settle before acting" idea as the commit-on-blur/release
  // pattern used elsewhere (table settings, gallery symmetry), just via a
  // short timer instead of waiting for pointer-up, so switching type or
  // tweaking a value updates the preview on its own without an explicit
  // "Generate" step. Skips the very first run (component mount) so just
  // *looking* at the Custom tab doesn't silently replace whatever's
  // currently showing (e.g. a Gallery selection) with Custom's default —
  // only an actual change should do that, matching Gallery's own rule of
  // never claiming regenerateActive ownership without actually generating.
  const isFirstRun = useRef(true);
  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    const timer = setTimeout(async () => {
      if (await regenerateFromCurrent()) {
        usePatternStore.getState().setRegenerator(async () => {
          await regenerateFromCurrent();
        });
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [customType, values, regenerateFromCurrent]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="grid grid-cols-2 gap-1.5 px-2.5 pt-2.5">
        {PATTERN_CONFIGS.map((c) => (
          <button
            key={c.id}
            onClick={() => setCustomType(c.id)}
            className={`rounded px-1 py-1.5 text-center text-[0.67rem] transition-colors ${
              c.id === customType
                ? 'border border-accent-border bg-accent-bg text-accent'
                : 'border border-card-border bg-[#222222] text-ink-dim hover:bg-[#2a2a2a] hover:text-ink'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 py-3">
        {config.note && <div className="mb-2.5 text-[0.78rem] leading-relaxed text-ink-dimmer">{config.note}</div>}
        <ParamForm params={config.params} values={values} onChange={(key, value) => setCustomParam(customType, key, value)} />
        {config.supportsSymmetry && (
          <div className="mt-3.5 border-t border-panel-border pt-3">
            <div className="flex items-center gap-2 text-[0.72rem] text-ink-muted">
              <label>Rotational copies</label>
              <input
                type="range"
                min={1}
                max={8}
                step={1}
                value={values.sym as number}
                className="w-[90px] accent-accent"
                onChange={(e) => setCustomParam(customType, 'sym', Number(e.target.value))}
              />
              <span className="text-accent">{values.sym as number}</span>
            </div>
          </div>
        )}
        <div className="mt-3 min-h-[1.1em] text-[0.7rem]">
          {generating && <span className="text-ink-muted">Generating…</span>}
          {error && <span className="text-danger">Error: {error}</span>}
        </div>
      </div>
    </div>
  );
}
