declare global {
  var umami:
    | { track: (eventName: string, eventData?: Record<string, string | number>) => void }
    | undefined;
}

/**
 * Sends a custom event to Umami analytics. No-ops if the Umami script is not
 * loaded (e.g. in dev or when analytics is disabled).
 * @returns void
 */
export function trackEvent(name: string, data?: Record<string, string | number>) {
  globalThis.umami?.track(name, data);
}
