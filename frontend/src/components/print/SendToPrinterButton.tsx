import { useNavigate } from '@tanstack/react-router';
import { usePatternStore } from '../../store/patternStore';
import { useOctoprintStore } from '../../store/octoprintStore';
import { useLiveOctoStatus } from '../../hooks/useLiveOctoStatus';
import { useOctoMutations } from '../../hooks/useOctoMutations';

export function SendToPrinterButton() {
  const navigate = useNavigate();
  const currentGcode = usePatternStore((s) => s.currentGcode);
  const currentName = usePatternStore((s) => s.currentName);
  const connected = useOctoprintStore((s) => s.connected);
  const status = useLiveOctoStatus();
  const { sendCurrentPattern } = useOctoMutations();

  async function handleSend() {
    if (!currentGcode) {
      useOctoprintStore.getState().addLog('No pattern loaded — generate one first', '#a00');
      navigate({ to: '/print' });
      return;
    }
    navigate({ to: '/print' });
    if (!connected) return;
    await sendCurrentPattern(currentName || 'pattern.gcode', currentGcode, status.isPrinting);
  }

  return (
    <button
      className="rounded-[5px] border border-accent-border bg-accent-bg px-2.5 py-1 text-[0.78rem] text-accent transition-colors hover:bg-accent-bg-hover disabled:cursor-default disabled:opacity-30"
      disabled={!currentGcode}
      onClick={handleSend}
    >
      ▶ Print
    </button>
  );
}
