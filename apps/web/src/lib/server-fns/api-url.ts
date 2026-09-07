// Must stay a function, not a hoisted const: the same-origin guard below needs to run at call time.
export function getApiUrl(): string {
  const url = process.env.API_INTERNAL_URL ?? "http://localhost:3000";
  if (globalThis.window !== undefined && url !== globalThis.location.origin) {
    throw new Error(
      `getApiUrl() returned the server-internal API base "${url}" in the browser ` +
        `(page origin is "${globalThis.location.origin}"). Browser code must call ` +
        `the API same-origin via browserApiOrpcClient, never the internal base.`,
    );
  }
  return url;
}
