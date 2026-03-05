import type { SearchField } from "@openrift/shared";
import { ALL_SEARCH_FIELDS, DEFAULT_SEARCH_SCOPE } from "@openrift/shared";
import { useState } from "react";

const STORAGE_KEY = "openrift-search-scope";

function getInitialScope(): SearchField[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return DEFAULT_SEARCH_SCOPE;
    }
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) {
      return DEFAULT_SEARCH_SCOPE;
    }
    const valid = parsed.filter((f): f is SearchField =>
      ALL_SEARCH_FIELDS.includes(f as SearchField),
    );
    return valid.length > 0 ? valid : DEFAULT_SEARCH_SCOPE;
  } catch {
    return DEFAULT_SEARCH_SCOPE;
  }
}

export function useSearchScope() {
  const [scope, setScope] = useState<SearchField[]>(getInitialScope);

  const toggleField = (field: SearchField) => {
    setScope((prev) => {
      const next = prev.includes(field) ? prev.filter((f) => f !== field) : [...prev, field];
      // Prevent empty scope
      if (next.length === 0) {
        return prev;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return { scope, toggleField };
}
