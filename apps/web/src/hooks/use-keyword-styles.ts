import type { KeywordsResponse } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";

import { initQueryOptions } from "@/hooks/use-init";

/**
 * Returns the keywords map from the init endpoint.
 *
 * @returns A record of keyword name to keyword entry (color, darkText, translations).
 */
export function useKeywordStyles(): KeywordsResponse["items"] {
  const { data } = useSuspenseQuery(initQueryOptions);
  return data.keywords as KeywordsResponse["items"];
}
