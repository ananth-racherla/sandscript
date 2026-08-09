import { useCallback } from 'react';
import { fetchVersion, sendCommand, connectSerial as connectSerialApi, uploadFile } from '../lib/octoprint/client';
import { useOctoprintStore, type QueueItem } from '../store/octoprintStore';

export function useOctoMutations() {
  const connect = useCallback(async () => {
    const s = useOctoprintStore.getState();
    if (!s.baseUrl || !s.apiKey) {
      throw new Error('Enter server URL and API key first');
    }
    try {
      const v = await fetchVersion({ baseUrl: s.baseUrl, apiKey: s.apiKey });
      const store = useOctoprintStore.getState();
      store.setConnected(true);
      store.setServerName(v.server);
      store.setConnectedIntent(true);
      store.clearLog();
    } catch {
      const store = useOctoprintStore.getState();
      store.setConnected(false);
      store.setConnectedIntent(false);
      store.addLog('Tip: enable CORS in OctoPrint → Settings → API', '#555');
      throw new Error('Connection failed — check URL and CORS settings');
    }
  }, []);

  const disconnect = useCallback(() => {
    useOctoprintStore.getState().setConnected(false);
    useOctoprintStore.getState().setConnectedIntent(false);
  }, []);

  const sendGrbl = useCallback(async (cmd: string) => {
    const s = useOctoprintStore.getState();
    s.addLog(cmd === '\x18' ? '(soft reset / Ctrl-X)' : cmd, '#7a8a7a', true);
    await sendCommand({ baseUrl: s.baseUrl, apiKey: s.apiKey }, cmd);
  }, []);

  const connectSerial = useCallback(async () => {
    const s = useOctoprintStore.getState();
    s.addLog('POST /api/connection {command:"connect"}', '#7a8a7a', true);
    try {
      await connectSerialApi({ baseUrl: s.baseUrl, apiKey: s.apiKey });
      s.addLog('Connecting to printer over serial…', '#c8a06a');
    } catch (e) {
      s.addLog(`Connect failed: ${e instanceof Error ? e.message : e}`, '#c00');
    }
  }, []);

  const uploadAndPrint = useCallback(async (name: string, gcode: string, startPrint: boolean) => {
    const s = useOctoprintStore.getState();
    try {
      await uploadFile({ baseUrl: s.baseUrl, apiKey: s.apiKey }, name, gcode, startPrint);
      s.cacheGcode(name, gcode);
      s.addLog(startPrint ? `▶ Printing: ${name}` : `✓ Uploaded: ${name}`, '#4a8');
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('fetch') || msg.includes('CORS') || msg.includes('Network')) {
        s.addLog('Network error — check CORS in OctoPrint → Settings → API', '#c00');
      } else {
        s.addLog(`Error: ${msg}`, '#c00');
      }
      return false;
    }
  }, []);

  /** Queue if the printer's busy, otherwise upload + print immediately. */
  const sendCurrentPattern = useCallback(
    async (name: string, gcode: string, isPrinterBusy: boolean) => {
      if (isPrinterBusy) {
        useOctoprintStore.getState().enqueue({ name, gcode });
        useOctoprintStore.getState().addLog(`Printer busy — queued: ${name}`, '#c8a06a');
        return;
      }
      await uploadAndPrint(name, gcode, true);
    },
    [uploadAndPrint],
  );

  const sendQueueItem = useCallback(
    async (item: QueueItem) => {
      await uploadAndPrint(item.name, item.gcode, true);
    },
    [uploadAndPrint],
  );

  return { connect, disconnect, sendGrbl, connectSerial, uploadAndPrint, sendCurrentPattern, sendQueueItem };
}
