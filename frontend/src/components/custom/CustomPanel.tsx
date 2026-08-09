import { useCallback, useState } from 'react';
import { PATTERN_CONFIGS } from '../../patterns/configs';
import { generateCustomGcode } from '../../patterns/generate';
import { usePatternStore } from '../../store/patternStore';
import { useTableStore } from '../../store/tableStore';
import { ParamForm } from './ParamForm';

export function CustomPanel() {
  const customType = usePatternStore((s) => s.customType);
  const setCustomType = usePatternStore((s) => s.setCustomType);
  const customValues = usePatternStore((s) => s.customValues);
  const setCustomParam = usePatternStore((s) => s.setCustomParam);

  const config = PATTERN_CONFIGS.find((c) => c.id === customType)!;
  const values = customValues[customType];

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reads customType/customValues fresh via getState() every time it runs,
  // so once registered as patternStore.regenerateActive, a later table
  // resize regenerates whatever the form's *current* values are — not
  // whatever they were at the moment "Generate" was last clicked.
  const regenerateFromCurrent = useCallback(async () => {
    const s = usePatternStore.getState();
    const table = useTableStore.getState().table;
    const { gcode, name } = await generateCustomGcode(s.customType, s.customValues[s.customType], table);
    usePatternStore.getState().loadPattern(gcode, name, 'custom');
  }, []);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      await regenerateFromCurrent();
      // Only claims ownership of regenerateActive on a successful generate
      // — matching Gallery's pattern of never registering on mount alone.
      usePatternStore.getState().setRegenerator(regenerateFromCurrent);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  }

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
      </div>

      <div className="border-t border-panel-border px-2.5 py-2.5">
        <button
          className="w-full rounded-[5px] border border-accent-border bg-accent-bg py-1.5 text-[0.8rem] text-accent transition-colors hover:bg-accent-bg-hover disabled:cursor-default disabled:opacity-30"
          disabled={generating}
          onClick={handleGenerate}
        >
          {generating ? 'Generating…' : '⚡ Generate & Preview'}
        </button>
        {error && <div className="mt-1.5 text-[0.7rem] text-danger">Error: {error}</div>}
      </div>
    </div>
  );
}
