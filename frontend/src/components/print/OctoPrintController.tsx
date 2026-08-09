import { useEffect } from 'react';
import { useOctoprintStore } from '../../store/octoprintStore';
import { useOctoStatus } from '../../hooks/useOctoStatus';
import { useOctoMutations } from '../../hooks/useOctoMutations';

/** No UI — owns the single OctoPrint status poll + its side effects
 * (queue auto-advance, background G-code fetch, auto-reconnect on load)
 * so they run exactly once regardless of which tab is visible. Mounted
 * once in __root.tsx, as a sibling of <Outlet/>, same reasoning as
 * <PreviewCanvas/>. Renders null. */
export function OctoPrintController() {
  const connected = useOctoprintStore((s) => s.connected);
  const connectedIntent = useOctoprintStore((s) => s.connectedIntent);
  const baseUrl = useOctoprintStore((s) => s.baseUrl);
  const apiKey = useOctoprintStore((s) => s.apiKey);
  const { connect, sendQueueItem } = useOctoMutations();

  useEffect(() => {
    if (connectedIntent && baseUrl && apiKey && !connected) {
      connect().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status = useOctoStatus(connected, (item) => {
    sendQueueItem(item);
  });

  useEffect(() => {
    useOctoprintStore.getState().setLiveStatus(status);
  });

  return null;
}
