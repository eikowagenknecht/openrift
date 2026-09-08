export const UVSGAMES_PROVIDER = "uvsgames";

export const PLAYLOLTCG_PROVIDER = "playloltcg";

export const PLAYLOLTCG_STATUS_FINISHED = 5;

export const TOPDECK_PROVIDER = "topdeck";

/**
 * The lookup key both sides of a format mapping are compared on, so
 * "Constructed", "CONSTRUCTED" and "Standard Constructed" cannot each need
 * their own stored row.
 */
export function normalizeFormatKey(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "");
}
