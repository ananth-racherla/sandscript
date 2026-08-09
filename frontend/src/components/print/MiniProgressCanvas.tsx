import { useEffect, useRef } from 'react';
import { useOctoprintStore } from '../../store/octoprintStore';
import { useTableStore } from '../../store/tableStore';
import { parseGcode } from '../../lib/gcode';
import type { OctoStatusView } from '../../lib/octoprint/types';

const MINI_W = 260;

export function MiniProgressCanvas({ status }: { status: OctoStatusView }) {
  const table = useTableStore((s) => s.table);
  const uploadedGcode = useOctoprintStore((s) => s.uploadedGcode);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const miniH = Math.round(MINI_W * (table.h / table.w));
    canvas.width = MINI_W;
    canvas.height = miniH;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#2a1d0e';
    ctx.fillRect(0, 0, MINI_W, miniH);

    const bare = status.jobFileName.split('/').pop() ?? '';
    const gcode = uploadedGcode[status.jobFileName] ?? uploadedGcode[bare];
    if (!gcode) {
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = '#3a2a18';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Fetching pattern…', MINI_W / 2, miniH / 2);
      return;
    }

    const pts = parseGcode(gcode);
    if (!pts.length) return;
    const M = Math.round(MINI_W * 0.025);
    const tc = (x: number, y: number): [number, number] => [
      M + ((x - table.xMin) / table.w) * (MINI_W - 2 * M),
      M + ((table.yMax - y) / table.h) * (miniH - 2 * M),
    ];

    ctx.beginPath();
    ctx.strokeStyle = '#3a2a18';
    ctx.lineWidth = 1;
    const [sx, sy] = tc(pts[0].x, pts[0].y);
    ctx.moveTo(sx, sy);
    for (let i = 1; i < pts.length; i++) {
      const [px, py] = tc(pts[i].x, pts[i].y);
      ctx.lineTo(px, py);
    }
    ctx.stroke();

    const fraction = (status.completion ?? 0) / 100;
    const end = Math.min(Math.floor(pts.length * fraction), pts.length - 1);
    if (end > 0) {
      ctx.beginPath();
      ctx.strokeStyle = '#d4a96a';
      ctx.lineWidth = 1.5;
      const [sx2, sy2] = tc(pts[0].x, pts[0].y);
      ctx.moveTo(sx2, sy2);
      for (let i = 1; i <= end; i++) {
        const [px, py] = tc(pts[i].x, pts[i].y);
        ctx.lineTo(px, py);
      }
      ctx.stroke();
      const [bx, by] = tc(pts[end].x, pts[end].y);
      ctx.beginPath();
      ctx.arc(bx, by, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    }
  }, [status.jobFileName, status.completion, uploadedGcode, table]);

  return (
    <div className="border-t border-panel-border px-2.5 py-2">
      <span className="text-[0.65rem] uppercase tracking-[0.1em] text-ink-faint">Currently drawing</span>
      <canvas ref={canvasRef} className="mt-1 block w-full rounded border border-card-border bg-canvas-bg" />
    </div>
  );
}
