import type { KeywordsResponse } from "@openrift/shared/types/api/keyword";
import { useSuspenseQuery } from "@tanstack/react-query";

import { initQueryOptions } from "@/hooks/use-init";

export function useKeywordStyles(): KeywordsResponse["items"] {
  const { data } = useSuspenseQuery(initQueryOptions);
  return data.keywords as KeywordsResponse["items"];
}
