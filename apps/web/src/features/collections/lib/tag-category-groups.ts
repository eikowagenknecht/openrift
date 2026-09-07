export interface TagCategoryGroup {
  slug: string;
  label: string;
  tags: string[];
}

export const UNCLASSIFIED_TAG_GROUP = "__other";

export function groupTagsByCategory(
  tags: readonly string[],
  categories: readonly { slug: string; label: string }[],
  categoryByTag: ReadonlyMap<string, string>,
): TagCategoryGroup[] {
  // A category no longer in the list (deleted, deploy skew) falls back to Other.
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
