import { bucketsMatchScope } from "@/lib/marketplace-coverage";
import type { PriceAssignBucket } from "@/lib/marketplace-coverage";

export interface PrevNextSlugs {
  prev: string | null;
  next: string | null;
}

/**
 * The current position is resolved in the full ordering, not the filtered
 * subset, so navigation keeps working once the current card stops matching.
 * No wrap-around: the ends return `null`.
 */
export function selectPrevNextSlug(
  orderedSlugs: readonly string[],
  currentSlug: string,
  matches?: (slug: string) => boolean,
): PrevNextSlugs {
  const index = orderedSlugs.indexOf(currentSlug);
  if (index === -1) {
    return { prev: null, next: null };
  }

  let prev: string | null = null;
  for (let i = index - 1; i >= 0; i--) {
    const slug = orderedSlugs[i];
    if (!matches || matches(slug)) {
      prev = slug;
      break;
    }
  }

  let next: string | null = null;
  for (let i = index + 1; i < orderedSlugs.length; i++) {
    const slug = orderedSlugs[i];
    if (!matches || matches(slug)) {
      next = slug;
      break;
    }
  }

  return { prev, next };
}

/**
 * At most one filter is ever set. A null corpus means off or still loading;
 * both fall back to plain neighbours.
 */
export interface AdminCardNavFilter {
  priceScope?: string | null;
  assignBucketsBySlug?: Map<string, PriceAssignBucket[]> | null;
  newPrintingSlugs?: Set<string> | null;
}

/** Composes the set scope (already applied to `orderedSlugs`) with whichever list-page filter is active. */
export function selectAdminCardPrevNext(
  orderedSlugs: readonly string[],
  currentSlug: string,
  filter: AdminCardNavFilter = {},
): PrevNextSlugs {
  const { priceScope, assignBucketsBySlug, newPrintingSlugs } = filter;
  if (newPrintingSlugs) {
    return selectPrevNextSlug(orderedSlugs, currentSlug, (slug) => newPrintingSlugs.has(slug));
  }
  if (!priceScope || !assignBucketsBySlug) {
    return selectPrevNextSlug(orderedSlugs, currentSlug);
  }
  return selectPrevNextSlug(orderedSlugs, currentSlug, (slug) =>
    bucketsMatchScope(assignBucketsBySlug.get(slug), priceScope),
  );
}
