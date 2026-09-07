declare global {
  var umami:
    | { track: (eventName: string, eventData?: Record<string, string | number>) => void }
    | undefined;
}

export function trackEvent(name: string, data?: Record<string, string | number>) {
  globalThis.umami?.track(name, data);
}
