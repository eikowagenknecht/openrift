/**
 * Kept in its own module, not the router context: wiring `siteUrl` through
 * `match.context` in route `head()` functions triggers a TanStack Router
 * type-inference cycle on routes that also have a `throw redirect(...)`
 * beforeLoad.
 */

export function getSiteUrl(): string {
  if (globalThis.window === undefined) {
    return process.env.SITE_URL ?? "http://localhost:5173";
  }
  return globalThis.window.location.origin;
}

export function getIsPreview(): boolean {
  if (globalThis.window === undefined) {
    return process.env.APP_ENV === "preview";
  }
  return (
    globalThis.document
      .querySelector<HTMLMetaElement>('meta[name="robots"]')
      ?.content.includes("noindex") ?? false
  );
}
