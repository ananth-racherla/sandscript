import { useTableStore } from '../../store/tableStore';
import { useDraftValue } from '../../hooks/useDraftValue';

const inputCls =
  'w-14 rounded border border-input-border bg-input px-1.5 py-0.5 text-right text-[0.72rem] text-ink focus:border-accent-border focus:outline-none';

export function TableSettingsBar() {
  const width = useTableStore((s) => s.width);
  const height = useTableStore((s) => s.height);
  const grooveWidthMM = useTableStore((s) => s.grooveWidthMM);
  const cornerRadiusMM = useTableStore((s) => s.cornerRadiusMM);
  const setDims = useTableStore((s) => s.setDims);
  const setGrooveWidth = useTableStore((s) => s.setGrooveWidth);
  const setCornerRadius = useTableStore((s) => s.setCornerRadius);

  // Local draft values so typing doesn't trigger regeneration on every
  // keystroke — committed on blur, matching the old app's 'change' semantics.
  const [wDraft, setWDraft] = useDraftValue(String(width));
  const [hDraft, setHDraft] = useDraftValue(String(height));
  const [grooveDraft, setGrooveDraft] = useDraftValue(String(grooveWidthMM));
  const [cornerDraft, setCornerDraft] = useDraftValue(String(cornerRadiusMM));

  return (
    <div className="flex flex-col gap-1 text-[0.72rem] text-ink-muted">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-1.5">
          Table size
          <input
            type="number"
            min={50}
            max={2000}
            step={1}
            value={wDraft}
            className={inputCls}
            onChange={(e) => setWDraft(e.target.value)}
            onBlur={() => setDims(parseFloat(wDraft), height)}
          />
          <span className="text-ink-faint">×</span>
          <input
            type="number"
            min={50}
            max={2000}
            step={1}
            value={hDraft}
            className={inputCls}
            onChange={(e) => setHDraft(e.target.value)}
            onBlur={() => setDims(width, parseFloat(hDraft))}
          />
          mm
        </label>
        <label className="flex items-center gap-1.5">
          Groove width
          <input
            type="number"
            min={0.5}
            max={100}
            step={0.5}
            value={grooveDraft}
            className={inputCls}
            onChange={(e) => setGrooveDraft(e.target.value)}
            onBlur={() => setGrooveWidth(parseFloat(grooveDraft))}
          />
          mm
        </label>
        <label className="flex items-center gap-1.5">
          Corner rounding
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={cornerDraft}
            className={inputCls}
            onChange={(e) => setCornerDraft(e.target.value)}
            onBlur={() => setCornerRadius(parseFloat(cornerDraft))}
          />
          mm
        </label>
      </div>
      <div className="text-[0.66rem] leading-snug text-ink-muted">
        Groove width is what the ball actually leaves in the sand. Corner rounding simulates the ball&rsquo;s
        momentum lagging behind sharp turns — it only affects this preview, not the G-code you send. Both are
        easiest to set by comparing against a real print; start corner rounding at 0.
      </div>
    </div>
  );
}
