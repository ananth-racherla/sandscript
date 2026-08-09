import { useOctoprintStore } from '../../store/octoprintStore';

export function QueueList() {
  const printQueue = useOctoprintStore((s) => s.printQueue);
  const dequeue = useOctoprintStore((s) => s.dequeue);
  const clearQueue = useOctoprintStore((s) => s.clearQueue);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[0.65rem] uppercase tracking-[0.1em] text-ink-faint">Queue ({printQueue.length})</span>
        <button onClick={clearQueue} className="text-[0.68rem] text-ink-faint">
          Clear all
        </button>
      </div>
      <div className="max-h-[110px] overflow-y-auto">
        {printQueue.length === 0 ? (
          <div className="py-0.5 text-[0.68rem] text-[#333333]">Empty</div>
        ) : (
          printQueue.map((item, i) => (
            <div key={i} className="flex items-center gap-1.5 border-b border-panel-border py-0.5">
              <span className="w-3.5 flex-none text-[0.68rem] text-ink-faint">{i + 1}.</span>
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[0.72rem] text-ink-dim" title={item.name}>
                {item.name}
              </span>
              <button onClick={() => dequeue(i)} className="px-0.5 text-[0.85rem] leading-none text-ink-faint">
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
