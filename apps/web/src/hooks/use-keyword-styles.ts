import type { KeywordStylesResponse } from "@openrift/shared";
import { useSuspenseQuery } from "@tanstack/react-query";

import { initQueryOptions } from "@/hooks/use-init";

/**
 * Returns the keyword styles map from the init endpoint.
 *
 * @returns A record of keyword name to style entry.
 */
export function useKeywordStyles(): KeywordStylesResponse["items"] {
  const { data } = useSuspenseQuery(initQueryOptions);
  return data.keywordStyles as KeywordStylesResponse["items"];
}
