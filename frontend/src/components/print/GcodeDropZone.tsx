import { useRef, useState } from 'react';
import { usePatternStore } from '../../store/patternStore';
import { useTableStore } from '../../store/tableStore';
import { ptsToGcode } from '../../lib/gcode';
import { fitPointsToTable } from '../../lib/geometry/fitToTable';

export function GcodeDropZone() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFile(file: File) {
    file.text().then((text) => {
      usePatternStore.getState().loadPattern(text, file.name, 'dropped');
      // A dropped file is static (no generator params to re-run), so a
      // table resize instead re-fits its existing points to the new
      // table — same distinction the old app made for activeSource==='dropped'.
      usePatternStore.getState().setRegenerator(async () => {
        const s = usePatternStore.getState();
        if (!s.pts.length) return;
        const table = useTableStore.getState().table;
        const fitted = fitPointsToTable(s.pts, table, 0.03);
        const gcode = ptsToGcode(fitted, file.name.replace(/\.gcode$/i, ''));
        usePatternStore.getState().loadPattern(gcode, file.name, 'dropped');
      });
    });
  }

  return (
    <div>
      <div className="mb-1.5 text-[0.74rem] text-ink-dim">Load .gcode file</div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
        className={`cursor-pointer rounded-md border border-dashed px-3 py-3 text-center text-[0.76rem] text-ink-muted transition-colors ${
          dragOver ? 'border-accent-border bg-accent-bg' : 'border-input-border hover:border-card-hover-border'
        }`}
      >
        Drop .gcode here or click
        <input
          ref={inputRef}
          type="file"
          accept=".gcode"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </div>
    </div>
  );
}
