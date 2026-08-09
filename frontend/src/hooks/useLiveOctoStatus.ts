import { useOctoprintStore } from '../store/octoprintStore';
import type { OctoStatusView } from '../lib/octoprint/types';

const DEFAULT_STATUS: OctoStatusView = {
  connected: false,
  reconnecting: false,
  state: 'Unknown',
  isDisconnected: false,
  isPrinting: false,
  isIdle: false,
  tempsText: '',
  jobFileName: '',
  completion: null,
  timeLeftText: '',
};

/** Read-only view of OctoPrintController's polling status — safe to call
 * from any number of components (unlike useOctoStatus itself, which owns
 * side effects that must only run once). */
export function useLiveOctoStatus(): OctoStatusView {
  return useOctoprintStore((s) => s.liveStatus) ?? DEFAULT_STATUS;
}
