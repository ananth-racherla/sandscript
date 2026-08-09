import { useState } from 'react';
import { useOctoprintStore } from '../../store/octoprintStore';
import { stateColor } from '../../lib/octoprint/stateMatch';
import type { OctoStatusView } from '../../lib/octoprint/types';

export function StatusBadge({
  status,
  onDisconnect,
  onConnectSerial,
  onSendGrbl,
}: {
  status: OctoStatusView;
  onDisconnect: () => void;
  onConnectSerial: () => Promise<void>;
  onSendGrbl: (cmd: string) => void;
}) {
  const serverName = useOctoprintStore((s) => s.serverName);
  const [grblInput, setGrblInput] = useState('');
  const [serialConnecting, setSerialConnecting] = useState(false);

  async function handleConnectSerial() {
    setSerialConnecting(true);
    try {
      await onConnectSerial();
    } finally {
      setSerialConnecting(false);
    }
  }

  function handleSendGrbl() {
    const cmd = grblInput.trim();
    if (!cmd) return;
    setGrblInput('');
    onSendGrbl(cmd);
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b border-panel-border px-2.5 py-2">
        <span className="text-[0.75rem]" style={{ color: status.reconnecting ? '#c96' : '#4a8' }}>
          {status.reconnecting ? '⚠ Reconnecting to OctoPrint…' : `● Connected — OctoPrint ${serverName}`}
        </span>
        <button onClick={onDisconnect} className="text-[0.68rem] text-ink-muted underline">
          Disconnect
        </button>
      </div>

      <div className="px-2.5 pb-1.5 pt-2">
        <div className="flex items-baseline justify-between">
          <span className="text-[0.9rem] font-semibold" style={{ color: stateColor(status.state) }}>
            {status.state}
          </span>
          <span className="text-[0.67rem] text-ink-muted">{status.tempsText}</span>
        </div>
        {status.jobFileName && (
          <div className="mt-0.5 overflow-hidden text-ellipsis whitespace-nowrap text-[0.68rem] text-ink-muted">{status.jobFileName}</div>
        )}

        {status.isDisconnected && (
          <div className="mt-2">
            <button
              onClick={handleConnectSerial}
              disabled={serialConnecting}
              className="w-full rounded border border-[#7a4a10] bg-[#3d2010] px-2 py-1.5 text-[0.78rem] text-[#e08a30] disabled:opacity-40"
            >
              ⚡ Connect to printer
            </button>
          </div>
        )}

        {status.isPrinting && status.completion != null && (
          <div className="mt-1.5">
            <div className="h-[3px] overflow-hidden rounded-full bg-line">
              <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${status.completion.toFixed(1)}%` }} />
            </div>
            <div className="mt-0.5 flex justify-between text-[0.67rem] text-ink-faint">
              <span>{status.completion.toFixed(0)}%</span>
              <span>{status.timeLeftText}</span>
            </div>
          </div>
        )}

        <div className="mt-2.5 flex gap-1.5">
          <input
            type="text"
            value={grblInput}
            onChange={(e) => setGrblInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendGrbl()}
            placeholder="GRBL command, e.g. $H"
            className="flex-1 rounded border border-input-border bg-input px-2 py-1 text-[0.78rem] text-ink focus:border-accent-border focus:outline-none"
          />
          <button onClick={handleSendGrbl} className="ctrl-btn">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
