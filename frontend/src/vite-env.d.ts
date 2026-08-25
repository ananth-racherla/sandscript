/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Public Turnstile site key for the pattern-submission form. Falls back to
   * Cloudflare's "always passes" test key (1x00000000000000000000AA) if unset,
   * so local dev works without a real key — set this for production builds. */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
