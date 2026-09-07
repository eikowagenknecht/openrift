import { slugifyName } from "@openrift/shared";
import { RESERVED_FRIEND_GROUP_SLUGS } from "@openrift/shared/contracts/friend-groups";

const MIN_LENGTH = 3;
const MAX_LENGTH = 30;

export function deriveGroupSlug(name: string): string {
  return slugifyName(name).slice(0, MAX_LENGTH).replace(/-+$/u, "");
}

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
