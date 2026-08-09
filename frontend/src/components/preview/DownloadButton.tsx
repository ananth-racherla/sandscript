import { usePatternStore } from '../../store/patternStore';

export function DownloadButton() {
  const currentGcode = usePatternStore((s) => s.currentGcode);
  const currentName = usePatternStore((s) => s.currentName);

  function handleDownload() {
    if (!currentGcode) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([currentGcode], { type: 'text/plain' }));
    a.download = currentName || 'pattern.gcode';
    a.click();
  }

  return (
    <button className="ctrl-btn" disabled={!currentGcode} onClick={handleDownload}>
      ↓ Download
    </button>
  );
}
