import { useEffect, useMemo, useRef, useState } from 'react';
import { usePatternStore } from '../../store/patternStore';
import { useTableStore } from '../../store/tableStore';
import { filletCorners } from '../../lib/geometry/fillet';
import type { Pt, TableBounds } from '../../lib/types';
import { DownloadButton } from './DownloadButton';
import { SendToPrinterButton } from '../print/SendToPrinterButton';

function sliderToRate(v: number): number {
  return Math.round(Math.exp((v * Math.log(100000)) / 100));
}
function fmtRate(r: number): string {
  if (r >= 10000) return `${Math.round(r / 1000)}k pts/s`;
  if (r >= 1000) return `${(r / 1000).toFixed(1)}k pts/s`;
  return `${r} pts/s`;
}

function t2c(x: number, y: number, canvas: HTMLCanvasElement, table: TableBounds): [number, number] {
  const W = canvas.width;
  const H = canvas.height;
  const M = Math.round(Math.min(W, H) * 0.025);
  return [M + ((x - table.xMin) / table.w) * (W - 2 * M), M + ((table.yMax - y) / table.h) * (H - 2 * M)];
}

function mmToPx(mm: number, canvas: HTMLCanvasElement, table: TableBounds): number {
  const W = canvas.width;
  const M = Math.round(Math.min(W, canvas.height) * 0.025);
  return (mm * (W - 2 * M)) / table.w;
}

export function PreviewCanvas() {
  const pts = usePatternStore((s) => s.pts);
  const currentName = usePatternStore((s) => s.currentName);
  const table = useTableStore((s) => s.table);
  const grooveWidthMM = useTableStore((s) => s.grooveWidthMM);
  const cornerRadiusMM = useTableStore((s) => s.cornerRadiusMM);

  // Derived, never an independently-mutated array — this is what actually
  // prevents the pts/renderPts drift bug from the old vanilla-JS app.
  const renderPts = useMemo(() => filletCorners(pts, cornerRadiusMM), [pts, cornerRadiusMM]);

  const wrapRef = useRef<HTMLDivElement>(null);
  const pathCanvasRef = useRef<HTMLCanvasElement>(null);
  const ballCanvasRef = useRef<HTMLCanvasElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  // ── Playback state lives entirely in refs, never Zustand/React state,
  // so the ~60fps animation loop never triggers a store-subscriber or
  // component re-render. ──
  //
  // progressRef is a FRACTION [0,1] OF THE RAW PATTERN (pts), not an index
  // into renderPts. That's the actual fix for the old app's bug: renderPts'
  // *length* changes whenever corner-rounding is recomputed, so an index
  // into it goes stale the instant that happens. A fraction of pts.length
  // is stable across corner-rounding changes — it only moves when the
  // pattern itself changes — so "how far along" can never desync from
  // "how much to draw."
  const progressRef = useRef(1); // 1 = fully drawn (matches "just loaded" behavior below)
  const lastDrawnRef = useRef(0); // last renderPts index actually stroked to the canvas
  const runningRef = useRef(false);
  const animIdRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const accumulatedRef = useRef(0);

  const ptsRef = useRef<Pt[]>(pts);
  const renderPtsRef = useRef<Pt[]>(renderPts);
  const tableRef = useRef<TableBounds>(table);
  const grooveRef = useRef(grooveWidthMM);
  const speedRef = useRef(50);
  const trailRef = useRef(0);
  const showBallRef = useRef(true);

  // UI-facing state — updates are infrequent (button clicks, slider drags,
  // pattern loads), not per-frame, so these are fine as React state.
  const [isPlaying, setIsPlaying] = useState(false);
  const hasPattern = pts.length > 0; // pure derived value, not worth its own state
  const [speed, setSpeedState] = useState(50);
  const [trail, setTrailState] = useState(0);
  const [showBall, setShowBallState] = useState(true);
  const [status, setStatus] = useState('Pick a preset from the Gallery, or go to Custom to adjust parameters.');

  useEffect(() => {
    ptsRef.current = pts;
  }, [pts]);
  useEffect(() => {
    tableRef.current = table;
  }, [table]);
  useEffect(() => {
    grooveRef.current = grooveWidthMM;
  }, [grooveWidthMM]);

  const grooveStrokePx = () => {
    const canvas = pathCanvasRef.current;
    if (!canvas) return 1;
    return Math.max(1, mmToPx(grooveRef.current, canvas, tableRef.current));
  };

  function clearCanvas() {
    const path = pathCanvasRef.current;
    const ball = ballCanvasRef.current;
    if (!path || !ball) return;
    const ctx = path.getContext('2d')!;
    ctx.fillStyle = '#2a1d0e';
    ctx.fillRect(0, 0, path.width, path.height);
    const [x1, y1] = t2c(tableRef.current.xMin, tableRef.current.yMax, path, tableRef.current);
    const [x2, y2] = t2c(tableRef.current.xMax, tableRef.current.yMin, path, tableRef.current);
    ctx.strokeStyle = '#3a2a18';
    ctx.lineWidth = 1;
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
    ball.getContext('2d')!.clearRect(0, 0, ball.width, ball.height);
  }

  function drawBall(pt: Pt | undefined) {
    const ball = ballCanvasRef.current;
    if (!ball) return;
    const bctx = ball.getContext('2d')!;
    bctx.clearRect(0, 0, ball.width, ball.height);
    if (!showBallRef.current || !pt) return;
    const [bx, by] = t2c(pt.x, pt.y, ball, tableRef.current);
    bctx.beginPath();
    bctx.arc(bx, by, 5, 0, Math.PI * 2);
    bctx.fillStyle = '#fff';
    bctx.fill();
    bctx.beginPath();
    bctx.arc(bx, by, 3, 0, Math.PI * 2);
    bctx.fillStyle = '#bbb';
    bctx.fill();
  }

  function strokeSegment(fromIdx: number, toIdx: number) {
    const path = pathCanvasRef.current;
    const rpts = renderPtsRef.current;
    if (!path || rpts.length < 2 || toIdx <= fromIdx) return;
    const ctx = path.getContext('2d')!;
    ctx.beginPath();
    ctx.strokeStyle = '#d4a96a';
    ctx.lineWidth = grooveStrokePx();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const [sx, sy] = t2c(rpts[fromIdx].x, rpts[fromIdx].y, path, tableRef.current);
    ctx.moveTo(sx, sy);
    for (let i = fromIdx + 1; i <= toIdx; i++) {
      const [px, py] = t2c(rpts[i].x, rpts[i].y, path, tableRef.current);
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  function updateProgressBarDOM(fraction: number) {
    if (progressBarRef.current) progressBarRef.current.style.width = `${(fraction * 100).toFixed(1)}%`;
  }

  /** Full redraw of everything up to the current progress fraction. Used
   * whenever renderPts or groove width changes mid-playback/mid-pause —
   * never touches progressRef itself, so it can't desync "how far along". */
  function fullRedrawAtCurrentProgress() {
    clearCanvas();
    const rpts = renderPtsRef.current;
    if (rpts.length < 2) return;
    const drawUpTo = Math.round(progressRef.current * (rpts.length - 1));
    if (drawUpTo >= 1) strokeSegment(0, drawUpTo);
    lastDrawnRef.current = drawUpTo;
    updateProgressBarDOM(progressRef.current);
    if (!runningRef.current) drawBall(rpts[drawUpTo]);
  }

  function resizeCanvas() {
    const wrap = wrapRef.current;
    const path = pathCanvasRef.current;
    const ball = ballCanvasRef.current;
    if (!wrap || !path || !ball) return;
    const cw = wrap.clientWidth;
    const ch = wrap.clientHeight;
    const t = tableRef.current;
    let w = cw;
    let h = (cw * t.h) / t.w;
    if (h > ch) {
      h = ch;
      w = (h * t.w) / t.h;
    }
    path.width = ball.width = Math.round(w);
    path.height = ball.height = Math.round(h);
    fullRedrawAtCurrentProgress();
  }

  // New pattern loaded (or regenerated): show it fully drawn immediately,
  // matching the old app's behavior — Play then restarts from 0. This
  // effect must run (and thus set progressRef) BEFORE the renderPts effect
  // below, so the redraw it triggers uses the right progress value; React
  // runs effects in declaration order for a given commit.
  useEffect(() => {
    runningRef.current = false;
    setIsPlaying(false);
    progressRef.current = pts.length > 0 ? 1 : 0;
    setStatus(pts.length > 0 ? `${currentName} — ${pts.length.toLocaleString()} points` : 'No G1 moves found.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pts]);

  // Rendering-only changes (corner rounding recomputing renderPts, groove
  // width changing stroke width, or the canvas itself resizing) redraw at
  // whatever progress already is — never reset it.
  useEffect(() => {
    renderPtsRef.current = renderPts;
    fullRedrawAtCurrentProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderPts, grooveWidthMM]);

  useEffect(() => {
    resizeCanvas();
    const observer = new ResizeObserver(() => resizeCanvas());
    if (wrapRef.current) observer.observe(wrapRef.current);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function tick(now: number) {
    if (!runningRef.current) return;
    const dt = Math.min(now - lastTimeRef.current, 100);
    lastTimeRef.current = now;
    const rate = sliderToRate(speedRef.current);
    const patternLen = Math.max(1, ptsRef.current.length);
    accumulatedRef.current += (rate / patternLen) * (dt / 1000);
    progressRef.current = Math.min(1, progressRef.current + accumulatedRef.current);
    accumulatedRef.current = 0;

    const path = pathCanvasRef.current;
    if (trailRef.current > 0 && path) {
      const ctx = path.getContext('2d')!;
      ctx.fillStyle = `rgba(42,29,14,${trailRef.current / 255})`;
      ctx.fillRect(0, 0, path.width, path.height);
    }

    const rpts = renderPtsRef.current;
    const drawUpTo = Math.round(progressRef.current * (rpts.length - 1));
    if (drawUpTo > lastDrawnRef.current) {
      strokeSegment(lastDrawnRef.current, drawUpTo);
      drawBall(rpts[drawUpTo]);
      lastDrawnRef.current = drawUpTo;
    }
    updateProgressBarDOM(progressRef.current);

    if (progressRef.current >= 1) {
      ballCanvasRef.current?.getContext('2d')!.clearRect(0, 0, ballCanvasRef.current.width, ballCanvasRef.current.height);
      runningRef.current = false;
      setIsPlaying(false);
      updateProgressBarDOM(1);
      return;
    }
    animIdRef.current = requestAnimationFrame(tick);
  }

  function play() {
    if (!ptsRef.current.length) return;
    if (progressRef.current >= 1) {
      progressRef.current = 0;
      lastDrawnRef.current = 0;
      clearCanvas();
    }
    runningRef.current = true;
    setIsPlaying(true);
    accumulatedRef.current = 0;
    lastTimeRef.current = performance.now();
    animIdRef.current = requestAnimationFrame(tick);
  }

  function pause() {
    runningRef.current = false;
    setIsPlaying(false);
    if (animIdRef.current) cancelAnimationFrame(animIdRef.current);
    drawBall(renderPtsRef.current[lastDrawnRef.current]);
  }

  function resetPlayback() {
    runningRef.current = false;
    if (animIdRef.current) cancelAnimationFrame(animIdRef.current);
    setIsPlaying(false);
    progressRef.current = 0;
    lastDrawnRef.current = 0;
    updateProgressBarDOM(0);
    clearCanvas();
    if (ptsRef.current.length) drawBall(renderPtsRef.current[0]);
  }

  return (
    <>
      <div ref={wrapRef} className="relative w-full flex-1 self-center overflow-hidden rounded-md shadow-[0_4px_32px_#000c]">
        <canvas ref={pathCanvasRef} className="absolute inset-0 block h-full w-full bg-canvas-bg" />
        <canvas ref={ballCanvasRef} className="pointer-events-none absolute inset-0 block h-full w-full" />
      </div>

      <div className="h-[3px] w-full overflow-hidden rounded-full bg-line">
        <div ref={progressBarRef} className="h-full bg-accent" style={{ width: '0%' }} />
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <button className="ctrl-btn" disabled={!hasPattern || isPlaying} onClick={play}>
          ▶ Play
        </button>
        <button className="ctrl-btn" disabled={!isPlaying} onClick={pause}>
          ⏸ Pause
        </button>
        <button className="ctrl-btn" disabled={!hasPattern} onClick={resetPlayback}>
          ↺ Reset
        </button>
        <label className="flex items-center gap-1.5 text-[0.72rem] text-ink-muted">
          Speed
          <input
            type="range"
            min={1}
            max={100}
            value={speed}
            className="w-[75px] accent-accent"
            onChange={(e) => {
              const v = Number(e.target.value);
              setSpeedState(v);
              speedRef.current = v;
            }}
          />
          <span className="min-w-[70px] text-[0.7rem] text-accent">{fmtRate(sliderToRate(speed))}</span>
        </label>
        <label className="flex items-center gap-1.5 text-[0.72rem] text-ink-muted">
          Trail
          <input
            type="range"
            min={0}
            max={30}
            value={trail}
            className="w-[75px] accent-accent"
            onChange={(e) => {
              const v = Number(e.target.value);
              setTrailState(v);
              trailRef.current = v;
            }}
          />
        </label>
        <label className="flex items-center gap-1.5 text-[0.72rem] text-ink-muted">
          <input
            type="checkbox"
            checked={showBall}
            onChange={(e) => {
              setShowBallState(e.target.checked);
              showBallRef.current = e.target.checked;
              if (!runningRef.current) drawBall(renderPtsRef.current[lastDrawnRef.current]);
            }}
          />
          Ball
        </label>
        <span className="flex-1" />
        <DownloadButton />
        <SendToPrinterButton />
      </div>

      <div className="min-h-[1.1em] text-[0.7rem] text-ink-muted">{status}</div>
    </>
  );
}
