import { slugifyName } from "@openrift/shared";
import { RESERVED_FRIEND_GROUP_SLUGS } from "@openrift/shared/contracts/friend-groups";

const MIN_LENGTH = 3;
const MAX_LENGTH = 30;

/**
 * Derives the group's URL address from its name, so nobody has to invent one.
 * Truncation can land on a dash, which the server's pattern rejects, so the
 * trailing dashes come off after the cut rather than before it.
 *
 * @returns The derived slug, which may still be too short to be valid.
 */
export function deriveGroupSlug(name: string): string {
  return slugifyName(name).slice(0, MAX_LENGTH).replace(/-+$/u, "");
}

/**
 * Mirrors `friendGroupSlugSchema` plus the reserved-name refinement, so the
 * dialog rejects what the server would reject instead of round-tripping a 400.
 *
 * @returns The message to show, or null when the slug is acceptable (an empty
 *   slug included, since that reads as "not filled in yet", not "wrong").
 */
export function groupSlugError(slug: string): string | null {
  if (slug.length === 0) {
    return null;
  }
  if (slug.length < MIN_LENGTH) {
    return `Use at least ${MIN_LENGTH} characters`;
  }
  if (slug.length > MAX_LENGTH) {
    return `Use at most ${MAX_LENGTH} characters`;
  }
  if (!/^[a-z0-9][a-z0-9-]+$/u.test(slug)) {
    return "Lowercase letters, digits, and dashes, starting with a letter or digit";
  }
  if (RESERVED_FRIEND_GROUP_SLUGS.has(slug)) {
    return "That address is taken by OpenRift, pick another";
  }
  return null;
}
