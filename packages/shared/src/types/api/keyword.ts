import type { keywordEntrySchema } from "@openrift/shared/contracts/init";
import type { z } from "zod";

export type KeywordEntry = z.infer<typeof keywordEntrySchema>;

export interface KeywordsResponse {
  items: Record<string, KeywordEntry>;
}
