// Client-side carrier for the catalog version token (the response's ETag), appended as
// `?v=` when fetching /api/v1/catalog so a content change rolls the edge cache key.
// Consume-once: the /cards SSR loader seeds one fresh token, later refetches fetch their own.

let seededVersion: string | null = null;

export function seedCatalogVersion(version: string | null): void {
  if (version !== null) {
    seededVersion = version;
  }
}

export function consumeSeededCatalogVersion(): string | null {
  const version = seededVersion;
  seededVersion = null;
  return version;
}

export function versionFromEtag(etagHeader: string | null): string | null {
  if (etagHeader === null) {
    return null;
  }
  const version = etagHeader.replace(/^W\//u, "").replaceAll('"', "");
  return version === "" ? null : version;
}
