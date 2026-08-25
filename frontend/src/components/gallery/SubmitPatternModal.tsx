import { useEffect, useRef, useState } from 'react';
import { track } from '../../lib/analytics';
import { wasm } from '../../lib/wasmClient';

const inputCls =
  'w-full rounded border border-input-border bg-input px-2 py-1 text-[0.78rem] text-ink focus:border-accent-border focus:outline-none';

// Turnstile site keys are public by design (like a Stripe publishable key —
// safe to ship in client code), so the real one is committed here directly.
// VITE_TURNSTILE_SITE_KEY can still override it — e.g. for local dev, set it
// to Cloudflare's documented "always passes" test key ('1x00000000000000000000AA'),
// since this widget is registered to the production domain and may not
// validate from localhost.
const PRODUCTION_SITE_KEY = '0x4AAAAAAEcFRQ-A01-nWMg0';
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || PRODUCTION_SITE_KEY;

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, opts: { sitekey: string; callback: (token: string) => void; theme?: string }) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

let turnstileScriptPromise: Promise<void> | null = null;
function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  turnstileScriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Turnstile'));
    document.head.appendChild(script);
  });
  return turnstileScriptPromise;
}

type Status = { kind: 'idle' } | { kind: 'submitting' } | { kind: 'error'; message: string } | { kind: 'success'; issueUrl: string };

export function SubmitPatternModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [gcodeFile, setGcodeFile] = useState<{ name: string; content: string } | null>(null);
  const [website, setWebsite] = useState(''); // honeypot
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const turnstileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !turnstileRef.current || !window.turnstile) return;
        window.turnstile.render(turnstileRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token) => setTurnstileToken(token),
        });
      })
      .catch(() => {
        if (!cancelled) setStatus({ kind: 'error', message: 'Could not load verification widget — please refresh and try again.' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const content = await file.text();
    setGcodeFile(null);
    try {
      // Validates against the real Rust parser (same one the app uses to
      // read/generate patterns) rather than a JS approximation of the
      // dialect — epsilon 0 so this only parses + dedupes, no simplification.
      wasm.optimizeGcode(content, 0);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      setStatus({ kind: 'error', message: `That doesn't look like a G-code file (${reason}).` });
      return;
    }
    setStatus({ kind: 'idle' });
    setGcodeFile({ name: file.name, content });
  }

  async function handleSubmit() {
    if (!name.trim()) {
      setStatus({ kind: 'error', message: 'Pattern name is required.' });
      return;
    }
    if (!gcodeFile) {
      setStatus({ kind: 'error', message: 'Attach a .gcode file first.' });
      return;
    }
    if (!turnstileToken) {
      setStatus({ kind: 'error', message: 'Please complete the verification check.' });
      return;
    }
    setStatus({ kind: 'submitting' });
    try {
      const res = await fetch('/api/submit-pattern', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category, description, gcode: gcodeFile.content, turnstileToken, website }),
      });
      const data = (await res.json()) as { issueUrl?: string; error?: string };
      if (!res.ok || !data.issueUrl) {
        setStatus({ kind: 'error', message: data.error ?? 'Submission failed — please try again.' });
        return;
      }
      track('pattern_submitted', { name });
      setStatus({ kind: 'success', issueUrl: data.issueUrl });
    } catch {
      setStatus({ kind: 'error', message: 'Network error — please try again.' });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-lg border border-panel-border bg-panel p-4 text-ink"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[0.9rem] font-semibold">Submit a pattern</h2>
          <button onClick={onClose} className="text-ink-muted hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

        {status.kind === 'success' ? (
          <div className="text-[0.8rem]">
            <p className="mb-2">Thanks! Your submission opened as a GitHub issue:</p>
            <a href={status.issueUrl} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
              {status.issueUrl}
            </a>
            <button
              onClick={onClose}
              className="mt-4 w-full rounded border border-accent-border bg-accent-bg px-2.5 py-1.5 text-[0.75rem] text-accent"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Pattern name"
              className={inputCls}
            />
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Category (optional) — e.g. Animals, Geometric"
              className={inputCls}
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={3}
              className={inputCls}
            />
            <input
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="absolute left-[-9999px] h-0 w-0 opacity-0"
            />
            <label className="text-[0.72rem] text-ink-muted">
              G-code file
              <input
                type="file"
                accept=".gcode,.gco,.nc,text/plain"
                onChange={(e) => handleFile(e.target.files?.[0])}
                className="mt-1 block w-full text-[0.72rem] text-ink-muted file:mr-2 file:rounded file:border file:border-input-border file:bg-input file:px-2 file:py-1 file:text-ink"
              />
            </label>
            {gcodeFile && <div className="text-[0.7rem] text-ink-muted">Attached: {gcodeFile.name}</div>}

            <div ref={turnstileRef} className="mt-1" />

            {status.kind === 'error' && <div className="text-[0.72rem] text-[#c00]">{status.message}</div>}

            <button
              onClick={handleSubmit}
              disabled={status.kind === 'submitting'}
              className="mt-1 w-full rounded border border-accent-border bg-accent-bg px-2.5 py-1.5 text-[0.75rem] text-accent disabled:opacity-40"
            >
              {status.kind === 'submitting' ? 'Submitting…' : 'Submit'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
