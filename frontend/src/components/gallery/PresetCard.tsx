import type { Preset } from '../../patterns/presets';

export function PresetCard({ preset, active, onClick }: { preset: Preset; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-[5px] border px-[9px] py-2 text-left transition-colors ${
        active ? 'border-card-active-border bg-card-active-bg' : 'border-card-border bg-card hover:border-card-hover-border hover:bg-[#252525]'
      }`}
    >
      <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[0.8rem] font-semibold text-ink">{preset.name}</div>
      <div className="mt-0.5 text-[0.68rem] leading-snug text-ink-muted">{preset.desc}</div>
    </button>
  );
}
