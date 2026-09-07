import type {
  listBulkAddResponseSchema,
  listDetailResponseSchema,
  listEntryResponseSchema,
  listListResponseSchema,
  listMoveResponseSchema,
  listResponseSchema,
  listShareResponseSchema,
} from "@openrift/shared/contracts/lists";
import type {
  listEntryDetailResponseSchema,
  listIntentResponseSchema,
  listKindResponseSchema,
  publicListDetailResponseSchema,
  publicListResponseSchema,
} from "@openrift/shared/response-schemas";
import type { z } from "zod";

export type ListIntent = z.infer<typeof listIntentResponseSchema>;

export type ListKind = z.infer<typeof listKindResponseSchema>;

/**
 * `manual` = a real `list_entries` row; `rule` = produced by the list's
 * dynamic rule; `both` = a manual entry the rule also produced, and the
 * manual row wins for id/overrides.
 */
export type EntrySource = z.infer<typeof listEntryDetailResponseSchema>["source"];

export type ListResponse = z.infer<typeof listResponseSchema>;

export type ListListResponse = z.infer<typeof listListResponseSchema>;

export type ListEntryResponse = z.infer<typeof listEntryResponseSchema>;

/**
 * `printing` and `copy` variants both carry a non-null `printingId` (for
 * copy, the printing under the physical copy); `card` has no printing.
 */
export type ListEntryDetailResponse = z.infer<typeof listEntryDetailResponseSchema>;

export type ListDetailResponse = z.infer<typeof listDetailResponseSchema>;

export type ListDetailListResponse = ListDetailResponse["list"];

export type PublicListResponse = z.infer<typeof publicListResponseSchema>;

export type PublicListDetailResponse = z.infer<typeof publicListDetailResponseSchema>;

export type ListShareResponse = z.infer<typeof listShareResponseSchema>;

export type ListBulkAddResponse = z.infer<typeof listBulkAddResponseSchema>;

export type ListMoveResponse = z.infer<typeof listMoveResponseSchema>;
