import { useRouter } from "@tanstack/react-router";
import { useContext } from "react";

import { FilterSearchProvider } from "@/lib/search-schemas";

/**
 * Structured-filter handler for the card-detail tag chips. On surfaces that
 * carry the filter search params (inside a `FilterSearchProvider`), clicking a
 * tag adds it to the `tags` filter, an exact match, instead of running a `t:`
 * substring search. Surfaces without the provider get `null` and should fall
 * back to a quoted `t:"…"` search.
 *
 * @returns A handler that adds the tag to the URL's `tags` filter, or null
 * when the surface has no filter search params.
 */
export function useApplyTagFilter(): ((tag: string) => void) | null {
  const filterSearch = useContext(FilterSearchProvider);
  const router = useRouter();
  if (filterSearch === null) {
    return null;
  }
  return (tag: string) => {
    void router.navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => {
        const current = Array.isArray(prev.tags) ? (prev.tags as string[]) : [];
        return { ...prev, tags: current.includes(tag) ? current : [...current, tag] };
      },
    });
  };
}
