// Mirrors the server admin schemas (apps/api/src/routes/admin/schemas.ts):
// entity slugs allow a single leading letter (the `*` quantifier), while
// feature-flag / site-setting keys require at least two leading characters
// (the `+` quantifier). Keep these patterns in sync with the server.
const SLUG_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const KEBAB_KEY_RE = /^[a-z][a-z0-9]+(?:-[a-z0-9]+)*$/u;

/**
 * Validates a kebab-case entity slug, matching the server slug schema.
 * @returns Whether `value` is a valid slug.
 */
export function isValidSlug(value: string): boolean {
  return SLUG_RE.test(value);
}

/**
 * Validates a kebab-case key for feature flags / site settings, matching the
 * server key schema (which requires at least two leading characters).
 * @returns Whether `value` is a valid kebab-case key.
 */
export function isValidKebabKey(value: string): boolean {
  return KEBAB_KEY_RE.test(value);
}
