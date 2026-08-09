export interface OctoCredentials {
  baseUrl: string;
  apiKey: string;
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/$/, '');
}

async function octoFetch(creds: OctoCredentials, path: string, opts: RequestInit = {}): Promise<Response> {
  return fetch(normalizeBaseUrl(creds.baseUrl) + path, {
    ...opts,
    headers: { 'X-Api-Key': creds.apiKey, ...(opts.headers || {}) },
  });
}

export async function fetchVersion(creds: OctoCredentials): Promise<{ server: string }> {
  const r = await octoFetch(creds, '/api/version');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

export interface OctoJob {
  state: string;
  progress: { completion: number | null; printTimeLeft: number | null } | null;
  job: { file: { name: string; refs?: { download?: string } } } | null;
}

export interface OctoPrinter {
  temperature?: { tool0?: { actual: number }; bed?: { actual: number } };
}

export async function fetchJob(creds: OctoCredentials): Promise<OctoJob> {
  const r = await octoFetch(creds, '/api/job');
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** Tolerant of failure — temperature display is a nice-to-have, not worth
 * failing the whole poll over. */
export async function fetchPrinter(creds: OctoCredentials): Promise<OctoPrinter | null> {
  try {
    const r = await octoFetch(creds, '/api/printer');
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export async function sendCommand(creds: OctoCredentials, command: string): Promise<void> {
  const r = await octoFetch(creds, '/api/printer/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
}

/** Tells OctoPrint to open its serial link to the board — distinct from
 * being able to reach OctoPrint's HTTP API at all, which can succeed even
 * when OctoPrint has no active connection to the printer (common right
 * after an OctoPrint restart). */
export async function connectSerial(creds: OctoCredentials): Promise<void> {
  const r = await octoFetch(creds, '/api/connection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command: 'connect' }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
}

export async function uploadFile(creds: OctoCredentials, name: string, gcode: string, startPrint: boolean): Promise<void> {
  const form = new FormData();
  form.append('file', new Blob([gcode], { type: 'text/plain' }), name);
  form.append('select', 'true');
  if (startPrint) form.append('print', 'true');
  const r = await octoFetch(creds, '/api/files/local', { method: 'POST', body: form });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Upload failed (HTTP ${r.status}): ${txt.slice(0, 100)}`);
  }
}

export async function fetchFileText(creds: OctoCredentials, filename: string, downloadUrl: string | null): Promise<string> {
  const bare = filename.split('/').pop()!;
  const url = downloadUrl || `${normalizeBaseUrl(creds.baseUrl)}/downloads/files/local/${encodeURIComponent(bare)}`;
  const r = await fetch(url, { headers: { 'X-Api-Key': creds.apiKey } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}
