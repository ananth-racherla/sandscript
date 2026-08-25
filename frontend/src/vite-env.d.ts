/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Overrides the production Turnstile site key committed in
   * SubmitPatternModal.tsx — set locally to Cloudflare's "always passes"
   * test key (1x00000000000000000000AA) if the production widget doesn't
   * validate from localhost. Not needed for a normal production build. */
  readonly VITE_TURNSTILE_SITE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
