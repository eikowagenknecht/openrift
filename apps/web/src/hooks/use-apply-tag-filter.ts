import { useRouter } from "@tanstack/react-router";
import { useContext } from "react";

import { FilterSearchProvider } from "@/lib/search-schemas";

/**
 * Returns null outside a `FilterSearchProvider`; callers must then fall back
 * to a quoted `t:"…"` search.
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
