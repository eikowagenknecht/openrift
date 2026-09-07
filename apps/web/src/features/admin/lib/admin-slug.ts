/** Mirrors apps/api/src/routes/admin/schemas.ts; keep these in sync with the server. */
const SLUG_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const KEBAB_KEY_RE = /^[a-z][a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function isValidSlug(value: string): boolean {
  return SLUG_RE.test(value);
}

export function isValidKebabKey(value: string): boolean {
  return KEBAB_KEY_RE.test(value);
}
