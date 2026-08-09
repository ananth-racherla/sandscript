import { useOctoprintStore } from '../../store/octoprintStore';

export function ActivityLog() {
  const log = useOctoprintStore((s) => s.log);

  return (
    <div className="max-h-[260px] overflow-y-auto">
      {log.map((entry) => (
        <div key={entry.id} className="flex items-baseline gap-1.5 border-b border-line-faint py-0.5">
          <span className="flex-none text-[0.6rem] tabular-nums text-ink-faint">{entry.time}</span>
          <span className={`min-w-0 flex-1 ${entry.raw ? 'font-mono text-[0.66rem]' : 'text-[0.68rem]'}`} style={{ color: entry.color }}>
            {entry.raw ? `→ ${entry.text}` : entry.text}
          </span>
        </div>
      ))}
    </div>
  );
}
