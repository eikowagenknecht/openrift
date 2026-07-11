/** One displayable group of printed tags: a category, or the "Other" bucket. */
export interface TagCategoryGroup {
  /** Category slug, or {@link UNCLASSIFIED_TAG_GROUP} for unclassified tags. */
  slug: string;
  label: string;
  tags: string[];
}

/** Group slug for tags with no admin classification yet. */
export const UNCLASSIFIED_TAG_GROUP = "__other";

/**
 * Groups printed tags into their admin-managed categories for display:
 * categories in /init display order, unclassified tags in a trailing
 * "Other tags" group. Empty groups are dropped, so a new set's tags stay
 * filterable (under Other) before anyone classifies them.
 *
 * @returns One group per non-empty category, in display order.
 */
export function groupTagsByCategory(
  tags: readonly string[],
  categories: readonly { slug: string; label: string }[],
  categoryByTag: ReadonlyMap<string, string>,
): TagCategoryGroup[] {
  // A tag whose mapped category isn't in the provided list (deleted category
  // still cached, deploy skew) falls back to Other instead of vanishing.
  const known = new Set(categories.map((category) => category.slug));
  const byCategory = Map.groupBy(tags, (tag) => {
    const category = categoryByTag.get(tag);
    return category !== undefined && known.has(category) ? category : UNCLASSIFIED_TAG_GROUP;
  });
  const groups: TagCategoryGroup[] = [];
  for (const category of categories) {
    const inCategory = byCategory.get(category.slug) ?? [];
    if (inCategory.length > 0) {
      groups.push({ slug: category.slug, label: category.label, tags: inCategory });
    }
  }
  const other = byCategory.get(UNCLASSIFIED_TAG_GROUP) ?? [];
  if (other.length > 0) {
    groups.push({ slug: UNCLASSIFIED_TAG_GROUP, label: "Other tags", tags: other });
  }
  return groups;
}
