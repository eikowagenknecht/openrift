import { bucketsMatchScope } from "@/lib/marketplace-coverage";
import type { PriceAssignBucket } from "@/lib/marketplace-coverage";

/** The neighbouring card slugs for the admin detail page's prev/next buttons. */
export interface PrevNextSlugs {
  prev: string | null;
  next: string | null;
}

/**
 * Nearest slug before and after `currentSlug` in `orderedSlugs` that satisfies
 * `matches` (every slug qualifies when no predicate is given).
 *
 * The current position is resolved in the full ordering, not in the filtered
 * subset, so navigation keeps working when the current card itself stops
 * matching — which is exactly what happens the moment its last staged product
 * is assigned. There is no wrap-around: the ends return `null`.
 *
 * @returns The neighbouring slugs, each `null` when there is none.
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
 * The list page's active status filter, resolved to the corpus each one needs.
 * At most one is ever set, because the list page's `status` param holds one
 * value. A `null` corpus means "off, or still loading" — both fall back to
 * plain neighbours rather than disabling the buttons mid-load.
 */
export interface AdminCardNavFilter {
  /** Scope of the prices-to-assign filter, `null` when it is off. */
  priceScope?: string | null;
  /** Assignable buckets per slug; `null` while the corpus query loads. */
  assignBucketsBySlug?: Map<string, PriceAssignBucket[]> | null;
  /**
   * Slugs with at least one candidate printing no accepted printing claims yet
   * — the new-printings filter. `null` when it is off or still loading.
   */
  newPrintingSlugs?: Set<string> | null;
}

/**
 * Prev/next for the admin card detail page, composing the set scope (already
 * applied to `orderedSlugs`) with whichever list-page filter is active.
 *
 * @returns The neighbouring slugs, each `null` when there is none.
 */
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
