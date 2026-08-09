import { useState } from 'react';
import { useOctoprintStore } from '../../store/octoprintStore';
import { useOctoMutations } from '../../hooks/useOctoMutations';

const inputCls =
  'w-full rounded border border-input-border bg-input px-2 py-1 text-[0.78rem] text-ink focus:border-accent-border focus:outline-none';

export function ConnectForm() {
  const baseUrl = useOctoprintStore((s) => s.baseUrl);
  const apiKey = useOctoprintStore((s) => s.apiKey);
  const setCredentials = useOctoprintStore((s) => s.setCredentials);
  const { connect } = useOctoMutations();

  const [urlDraft, setUrlDraft] = useState(baseUrl);
  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [connecting, setConnecting] = useState(false);
  const [badge, setBadge] = useState<{ text: string; color: string } | null>(null);

  async function handleConnect() {
    setCredentials(urlDraft, keyDraft);
    setConnecting(true);
    setBadge({ text: 'Connecting…', color: '#888' });
    try {
      await connect();
      setBadge(null);
    } catch (e) {
      setBadge({ text: e instanceof Error ? e.message : String(e), color: '#c00' });
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="px-2.5 py-2.5">
      <div className="mb-1.5 text-[0.74rem] text-ink-dim">OctoPrint server</div>
      <input
        type="text"
        value={urlDraft}
        onChange={(e) => setUrlDraft(e.target.value)}
        onBlur={() => setCredentials(urlDraft, apiKey)}
        placeholder="http://octopi.local"
        className={`${inputCls} mb-1.5`}
      />
      <input
        type="password"
        value={keyDraft}
        onChange={(e) => setKeyDraft(e.target.value)}
        onBlur={() => setCredentials(baseUrl, keyDraft)}
        placeholder="API key (Settings → API)"
        className={inputCls}
      />
      <div className="mt-2 flex items-center gap-2.5">
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="whitespace-nowrap rounded border border-accent-border bg-accent-bg px-2.5 py-1.5 text-[0.75rem] text-accent disabled:opacity-40"
        >
          {connecting ? 'Connecting…' : 'Connect'}
        </button>
        {badge && (
          <span className="text-[0.72rem]" style={{ color: badge.color }}>
            {badge.text}
          </span>
        )}
      </div>
    </div>
  );
}
