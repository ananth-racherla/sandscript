import type { ParamFormat, ParamSpec } from '../../patterns/configs';
import { SvgDropZone } from './SvgDropZone';

function formatValue(v: number, format?: ParamFormat): string {
  switch (format) {
    case 'float2':
      return v.toFixed(2);
    case 'float3':
      return v.toFixed(3);
    case 'float2pi':
      return `${v.toFixed(2)}π`;
    default:
      return String(v);
  }
}

const fieldInputCls =
  'mt-1 w-full rounded border border-input-border bg-input px-2 py-1 text-[0.78rem] text-ink focus:border-accent-border focus:outline-none';

export function ParamForm({
  params,
  values,
  onChange,
}: {
  params: ParamSpec[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  return (
    <div className="flex flex-col gap-3.5">
      {params.map((p) => {
        if (p.kind === 'slider') {
          const v = values[p.key] as number;
          return (
            <div key={p.key}>
              <div className="flex items-center justify-between text-[0.74rem]">
                <span className="text-ink-dim">{p.label}</span>
                <span className="text-accent">{formatValue(v, p.format)}</span>
              </div>
              <input
                type="range"
                min={p.min}
                max={p.max}
                step={p.step}
                value={v}
                className="mt-1 w-full accent-accent"
                onChange={(e) => onChange(p.key, Number(e.target.value))}
              />
              {p.hint && <div className="mt-1 text-[0.68rem] leading-snug text-ink-muted">{p.hint}</div>}
            </div>
          );
        }

        if (p.kind === 'number') {
          const v = values[p.key] as number;
          return (
            <div key={p.key}>
              <div className="text-[0.74rem] text-ink-dim">{p.label}</div>
              <input
                type="number"
                min={p.min}
                max={p.max}
                value={v}
                className={fieldInputCls}
                onChange={(e) => onChange(p.key, Number(e.target.value))}
              />
              {p.hint && <div className="mt-1 text-[0.68rem] leading-snug text-ink-muted">{p.hint}</div>}
            </div>
          );
        }

        if (p.kind === 'select') {
          const v = values[p.key] as string;
          const opt = p.options.find((o) => o.value === v);
          return (
            <div key={p.key}>
              <div className="text-[0.74rem] text-ink-dim">{p.label}</div>
              <select value={v} className={fieldInputCls} onChange={(e) => onChange(p.key, e.target.value)}>
                {p.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {opt?.hint && <div className="mt-1 text-[0.68rem] leading-snug text-ink-muted">{opt.hint}</div>}
            </div>
          );
        }

        if (p.kind === 'toggle') {
          const v = values[p.key] as string;
          return (
            <div key={p.key}>
              <div className="text-[0.74rem] text-ink-dim">{p.label}</div>
              <div className="mt-1 flex gap-1.5">
                {p.options.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => onChange(p.key, o.value)}
                    className={`flex-1 rounded border px-2 py-1.5 text-[0.72rem] transition-colors ${
                      v === o.value
                        ? 'border-accent-border bg-accent-bg text-accent'
                        : 'border-input-border bg-input text-ink-dim hover:text-ink'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          );
        }

        return (
          <SvgDropZone key={p.key} label={p.label} hint={p.hint} file={values[p.key] as File | null} onSelect={(f) => onChange(p.key, f)} />
        );
      })}
    </div>
  );
}
