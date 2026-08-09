import { useRef, useState } from 'react';

export function SvgDropZone({
  label,
  hint,
  file,
  onSelect,
}: {
  label: string;
  hint?: string;
  file: File | null;
  onSelect: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  return (
    <div>
      <div className="mb-1.5 text-[0.74rem] text-ink-dim">{label}</div>
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
          if (f) onSelect(f);
        }}
        className={`cursor-pointer rounded-md border border-dashed px-3 py-4 text-center text-[0.76rem] text-ink-muted transition-colors ${
          dragOver ? 'border-accent-border bg-accent-bg' : 'border-input-border hover:border-card-hover-border'
        }`}
      >
        Click or drop an SVG here
        <input
          ref={inputRef}
          type="file"
          accept=".svg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onSelect(f);
          }}
        />
      </div>
      {file && <div className="mt-1 text-[0.68rem] text-ink-muted">Selected: {file.name}</div>}
      {hint && <div className="mt-1 text-[0.68rem] leading-snug text-ink-muted">{hint}</div>}
    </div>
  );
}
