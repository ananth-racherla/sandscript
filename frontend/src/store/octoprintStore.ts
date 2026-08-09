import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Pt } from '../lib/types';
import type { OctoStatusView } from '../lib/octoprint/types';

export interface QueueItem {
  name: string;
  gcode: string;
}

export interface LogEntry {
  id: number;
  time: string;
  text: string;
  color: string;
  raw?: boolean;
}

let logIdCounter = 0;

interface OctoprintState {
  baseUrl: string;
  apiKey: string;
  /** Mirrors the old app's 'op-active' localStorage flag: "the user asked
   * to be connected" — checked once on load to decide whether to
   * auto-reconnect, independent of live connection status (which is
   * TanStack Query's job, not this store's — see useOctoStatus). */
  connectedIntent: boolean;
  /** Live "we're actually talking to OctoPrint right now" flag — distinct
   * from connectedIntent (the persisted "should auto-reconnect on load"
   * flag). Not persisted; every page load starts disconnected and, if
   * connectedIntent + credentials are present, reconnects once. */
  connected: boolean;
  serverName: string;
  printQueue: QueueItem[];
  log: LogEntry[];
  /** Final point of the last pattern actually sent to print — the only
   * thing that tells us where the ball ended up, so the next print can
   * route its lead-in from there instead of cutting straight across
   * whatever's already on the table. See lib/geometry/boundaryLeadIn. */
  lastPrintEndPoint: Pt | null;
  /** filename → gcode text, cached so the mini progress canvas doesn't
   * re-fetch on every poll tick. Not persisted — fine to lose on reload. */
  uploadedGcode: Record<string, string>;
  /** Derived polling-status view, written by the single always-mounted
   * OctoPrintController (which owns the real useOctoStatus query + its
   * side effects) and read by everything else (PrintPanel,
   * SendToPrinterButton) — so there's exactly one poller and one
   * queue-auto-advance effect regardless of how many components care
   * about the current status. */
  liveStatus: OctoStatusView | null;

  setCredentials: (baseUrl: string, apiKey: string) => void;
  setConnectedIntent: (v: boolean) => void;
  setConnected: (v: boolean) => void;
  setServerName: (name: string) => void;
  setLiveStatus: (status: OctoStatusView) => void;
  enqueue: (item: QueueItem) => void;
  dequeue: (index: number) => void;
  clearQueue: () => void;
  shiftQueue: () => QueueItem | undefined;
  addLog: (text: string, color?: string, raw?: boolean) => void;
  clearLog: () => void;
  setLastPrintEndPoint: (pt: Pt | null) => void;
  cacheGcode: (name: string, gcode: string) => void;
}

export const useOctoprintStore = create<OctoprintState>()(
  persist(
    (set, get) => ({
      baseUrl: '',
      apiKey: '',
      connectedIntent: false,
      connected: false,
      serverName: '',
      printQueue: [],
      log: [],
      lastPrintEndPoint: null,
      uploadedGcode: {},
      liveStatus: null,

      setCredentials: (baseUrl, apiKey) => set({ baseUrl, apiKey }),
      setConnectedIntent: (v) => set({ connectedIntent: v }),
      setConnected: (v) => set({ connected: v }),
      setServerName: (name) => set({ serverName: name }),
      setLiveStatus: (status) => set({ liveStatus: status }),
      enqueue: (item) => set((s) => ({ printQueue: [...s.printQueue, item] })),
      dequeue: (index) => set((s) => ({ printQueue: s.printQueue.filter((_, i) => i !== index) })),
      clearQueue: () => set({ printQueue: [] }),
      shiftQueue: () => {
        const [first, ...rest] = get().printQueue;
        if (first) set({ printQueue: rest });
        return first;
      },
      addLog: (text, color = '#555', raw = false) =>
        set((s) => ({
          log: [{ id: logIdCounter++, time: new Date().toLocaleTimeString([], { hour12: false }), text, color, raw }, ...s.log].slice(
            0,
            25,
          ),
        })),
      clearLog: () => set({ log: [] }),
      setLastPrintEndPoint: (pt) => set({ lastPrintEndPoint: pt }),
      cacheGcode: (name, gcode) => set((s) => ({ uploadedGcode: { ...s.uploadedGcode, [name]: gcode } })),
    }),
    {
      name: 'sandscript-octoprint',
      partialize: (s) => ({
        baseUrl: s.baseUrl,
        apiKey: s.apiKey,
        connectedIntent: s.connectedIntent,
        lastPrintEndPoint: s.lastPrintEndPoint,
      }),
    },
  ),
);
