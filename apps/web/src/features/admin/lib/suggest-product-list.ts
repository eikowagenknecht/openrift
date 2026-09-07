import { slugifyName } from "@openrift/shared/utils";

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
 * Finds the printing list that most likely backs `product`, for the re-sync
 * dialog to pre-select. Matches the derived slug first, falling back to a
 * case-insensitive name match for a since-edited slug.
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
