import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { fetchJob, fetchPrinter, fetchFileText, type OctoJob, type OctoPrinter } from '../lib/octoprint/client';
import type { OctoStatusView } from '../lib/octoprint/types';
import { useOctoprintStore, type QueueItem } from '../store/octoprintStore';

interface OctoStatusData {
  job: OctoJob;
  printer: OctoPrinter | null;
}

function formatTemps(printer: OctoPrinter | null): string {
  if (!printer?.temperature) return '';
  const t = printer.temperature;
  const parts: string[] = [];
  if (t.tool0) parts.push(`🌡 ${t.tool0.actual.toFixed(0)}°`);
  if (t.bed) parts.push(`⬛ ${t.bed.actual.toFixed(0)}°`);
  return parts.join('  ');
}

function formatTimeLeft(sec: number | null): string {
  if (sec == null) return '';
  return sec < 60 ? `${sec}s` : `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

/** Polls OctoPrint's job + printer endpoints every 3s while connected.
 * Owns real side effects (queue auto-advance, background G-code fetch) —
 * call this from exactly one always-mounted place (OctoPrintController).
 * Everywhere else should read the derived view via useLiveOctoStatus()
 * instead of calling this directly, or the auto-advance effect below would
 * fire once per call site and could pop two queue items for one print.
 * TanStack Query owns the request/retry itself (each 3s tick is one
 * already-final attempt — the interval *is* the retry loop); the
 * business logic layered on top (fail-streak → "Reconnecting…", queue
 * auto-advance on the idle transition, background G-code fetch for the
 * mini preview) lives in the effects below, per the plan's split between
 * what Query owns and what's just built on it. */
export function useOctoStatus(connected: boolean, onAutoAdvance: (item: QueueItem) => void): OctoStatusView {
  const baseUrl = useOctoprintStore((s) => s.baseUrl);
  const apiKey = useOctoprintStore((s) => s.apiKey);
  const addLog = useOctoprintStore((s) => s.addLog);

  const query = useQuery<OctoStatusData>({
    queryKey: ['octoStatus', baseUrl, apiKey],
    queryFn: async () => {
      const creds = { baseUrl, apiKey };
      const [job, printer] = await Promise.all([fetchJob(creds), fetchPrinter(creds)]);
      return { job, printer };
    },
    enabled: connected,
    refetchInterval: 3000,
    retry: false,
  });

  const failCountRef = useRef(0);
  const reconnectingRef = useRef(false);
  const prevWasPrintingRef = useRef(false);
  const fetchingFileRef = useRef<string | null>(null);

  if (!connected) {
    failCountRef.current = 0;
    reconnectingRef.current = false;
    prevWasPrintingRef.current = false;
  } else if (query.isError) {
    failCountRef.current++;
    if (failCountRef.current === 3) reconnectingRef.current = true;
  } else if (query.data && failCountRef.current > 0) {
    failCountRef.current = 0;
    reconnectingRef.current = false;
  }

  // Auto-start the next queued item once the printer transitions from
  // printing into idle — mirrors the old app's prevWasPrinting-diffed check.
  useEffect(() => {
    if (!query.data) return;
    const s = query.data.job.state;
    const isPrinting = s === 'Printing' || s === 'Paused';
    const isIdle = s === 'Operational';
    if (prevWasPrintingRef.current && isIdle) {
      const next = useOctoprintStore.getState().shiftQueue();
      if (next) {
        addLog('Print finished — starting next in queue', '#888');
        onAutoAdvance(next);
      }
    }
    prevWasPrintingRef.current = isPrinting;
  }, [query.data, addLog, onAutoAdvance]);

  // Background-fetch the printing job's G-code once, for the mini preview
  // canvas — OctoPrint doesn't include the content in /api/job, only the
  // filename.
  useEffect(() => {
    if (!query.data) return;
    const { job } = query.data;
    const isPrinting = job.state === 'Printing' || job.state === 'Paused';
    const fileName = job.job?.file?.name;
    if (!isPrinting || !fileName) return;
    if (useOctoprintStore.getState().uploadedGcode[fileName] || fetchingFileRef.current === fileName) return;
    fetchingFileRef.current = fileName;
    fetchFileText({ baseUrl, apiKey }, fileName, job.job?.file?.refs?.download ?? null)
      .then((text) => {
        useOctoprintStore.getState().cacheGcode(fileName, text);
        addLog(`Loaded G-code from printer: ${fileName.split('/').pop()}`, '#555');
      })
      .catch(() => {
        // Silent — the mini preview simply won't show until the next attempt.
      })
      .finally(() => {
        fetchingFileRef.current = null;
      });
  }, [query.data, baseUrl, apiKey, addLog]);

  const job = query.data?.job;
  const state = job?.state ?? 'Unknown';
  const isPrinting = state === 'Printing' || state === 'Paused';
  const isIdle = state === 'Operational';

  return {
    connected,
    reconnecting: reconnectingRef.current,
    state,
    isDisconnected: state.startsWith('Offline') || state.startsWith('Closed'),
    isPrinting,
    isIdle,
    tempsText: formatTemps(query.data?.printer ?? null),
    jobFileName: isPrinting ? (job?.job?.file?.name ?? '') : '',
    completion: isPrinting ? (job?.progress?.completion ?? null) : null,
    timeLeftText: isPrinting ? formatTimeLeft(job?.progress?.printTimeLeft ?? null) : '',
  };
}
