import { foldForSearch } from "@openrift/shared/search-fold";

export function matches(query: string, ...fields: (string | undefined | null)[]): boolean {
  if (!query) {
    return true;
  }
  // Folded on both sides so a typed apostrophe finds the curly one in the copy.
  // Definitions are prose, so no squashed comparison here — see `squashForSearch`.
  const needle = foldForSearch(query);
  return fields.some((field) => (field ? foldForSearch(field).includes(needle) : false));
}
