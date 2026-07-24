import { slugifyName } from "@openrift/shared";

interface SuggestibleList {
  id: string;
  name: string;
  kind: string;
}

interface SuggestibleProduct {
  name: string;
  slug: string;
}

/**
 * Finds the printing list that most likely backs `product`, so the re-sync
 * dialog can pre-select it. A product created from a list shares that list's
 * name (its slug is `slugifyName(name)`), so we match on the derived slug first
 * and fall back to a case-insensitive name match when an admin has since edited
 * the slug.
 *
 * @returns The matching list id, or null when no printing list looks like the product.
 */
export function suggestListIdForProduct(
  lists: readonly SuggestibleList[],
  product: SuggestibleProduct,
): string | null {
  const normalizedName = product.name.trim().toLowerCase();
  const match = lists.find(
    (list) =>
      list.kind === "printing" &&
      (slugifyName(list.name) === product.slug ||
        list.name.trim().toLowerCase() === normalizedName),
  );
  return match?.id ?? null;
}
