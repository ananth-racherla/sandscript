type EventData = Record<string, string | number | boolean>;

declare global {
  interface Window {
    umami?: { track: (event: string, data?: EventData) => void };
  }
}

/** No-ops if the Umami script hasn't loaded (blocked, offline, dev build without it). */
export function track(event: string, data?: EventData) {
  window.umami?.track(event, data);
}
