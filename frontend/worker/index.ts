export interface Env {
  ASSETS: Fetcher;
  /** Fine-grained GitHub PAT: Issues:write on the sandscript repo + account-level Gists:write. */
  GITHUB_TOKEN: string;
  TURNSTILE_SECRET_KEY: string;
}

const REPO = 'ananth-racherla/sandscript';
const MAX_GCODE_BYTES = 2 * 1024 * 1024;

interface SubmitBody {
  name?: unknown;
  category?: unknown;
  description?: unknown;
  gcode?: unknown;
  turnstileToken?: unknown;
  /** Honeypot — a real submitter never fills this hidden field. */
  website?: unknown;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/submit-pattern') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
      return handleSubmitPattern(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};

async function handleSubmitPattern(request: Request, env: Env): Promise<Response> {
  let body: SubmitBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  if (typeof body.website === 'string' && body.website.trim() !== '') {
    // Honeypot tripped — pretend success so the bot doesn't learn anything.
    return json({ issueUrl: null }, 200);
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const gcode = typeof body.gcode === 'string' ? body.gcode : '';

  if (!name) return json({ error: 'Pattern name is required' }, 400);
  if (name.length > 200) return json({ error: 'Pattern name is too long' }, 400);
  if (!gcode.trim()) return json({ error: 'G-code content is required' }, 400);
  if (new TextEncoder().encode(gcode).length > MAX_GCODE_BYTES) {
    return json({ error: `G-code file is too large (max ${MAX_GCODE_BYTES / (1024 * 1024)}MB)` }, 400);
  }
  const gcodeCheck = validateGcode(gcode);
  if (!gcodeCheck.ok) return json({ error: gcodeCheck.reason }, 400);

  const verified = await verifyTurnstile(body.turnstileToken, request, env);
  if (!verified) return json({ error: 'Verification failed — please try again' }, 400);

  try {
    const gistUrl = await createGist(env, `${sanitizeFilename(name)}.gcode`, gcode);
    const issueUrl = await createIssue(env, { name, category, description, gistUrl });
    return json({ issueUrl });
  } catch (e) {
    console.error(e);
    return json({ error: 'Something went wrong creating the submission. Please try again later.' }, 502);
  }
}

async function verifyTurnstile(token: unknown, request: Request, env: Env): Promise<boolean> {
  if (typeof token !== 'string' || !token) return false;
  const form = new FormData();
  form.append('secret', env.TURNSTILE_SECRET_KEY);
  form.append('response', token);
  const ip = request.headers.get('CF-Connecting-IP');
  if (ip) form.append('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
  const data = (await res.json()) as { success: boolean };
  return data.success === true;
}

async function githubApi(env: Env, path: string, init: RequestInit): Promise<unknown> {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'sandscript-worker',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`GitHub API ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function createGist(env: Env, filename: string, content: string): Promise<string> {
  const data = (await githubApi(env, '/gists', {
    method: 'POST',
    body: JSON.stringify({
      description: `Sandscript pattern submission: ${filename}`,
      public: false,
      files: { [filename]: { content } },
    }),
  })) as { html_url: string };
  return data.html_url;
}

async function createIssue(env: Env, params: { name: string; category: string; description: string; gistUrl: string }): Promise<string> {
  const { name, category, description, gistUrl } = params;
  const bodyLines = [
    `**Pattern name:** ${name}`,
    category ? `**Category:** ${category}` : null,
    description ? `**Description:**\n${description}` : null,
    `**G-code:** ${gistUrl}`,
    '',
    '_Submitted via the site’s pattern-submission form._',
  ].filter((l): l is string => l !== null);

  const data = (await githubApi(env, `/repos/${REPO}/issues`, {
    method: 'POST',
    body: JSON.stringify({
      title: `[Pattern] ${name}`,
      body: bodyLines.join('\n\n'),
      labels: ['pattern-submission'],
    }),
  })) as { html_url: string };
  return data.html_url;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'pattern';
}

// Matches the dialect this project actually emits/reads — see ptsToGcode /
// parseGcode in frontend/src/lib/gcode.ts: a ';'-comment header followed by
// nothing but `G1 X<num> Y<num>` moves (no Z, no arcs, no other G-codes —
// this table only has two axes). Keep in sync with that regex.
const MOVE_LINE_RE = /^G1\s+X[+-]?\d+\.?\d*\s+Y[+-]?\d+\.?\d*\s*$/;
const MIN_MOVES = 2; // a path needs at least two points
const MIN_MOVE_FRACTION = 0.9; // tolerate a few odd lines, not a file that's mostly something else

function validateGcode(text: string): { ok: true } | { ok: false; reason: string } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith(';'));
  if (lines.length === 0) {
    return { ok: false, reason: "That doesn't look like a G-code file — no content found." };
  }
  const moveLines = lines.filter((l) => MOVE_LINE_RE.test(l));
  if (moveLines.length < MIN_MOVES) {
    return { ok: false, reason: "That doesn't look like a sandscript G-code file (expected G1 X.. Y.. moves)." };
  }
  if (moveLines.length / lines.length < MIN_MOVE_FRACTION) {
    return { ok: false, reason: 'File has too many lines that are not G1 X.. Y.. moves — is this the right file?' };
  }
  return { ok: true };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
}
