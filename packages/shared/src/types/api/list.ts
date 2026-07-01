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
  publicListDetailResponseSchema,
  publicListResponseSchema,
} from "@openrift/shared/response-schemas";
import type { z } from "zod";

export type ListIntent = "wish" | "trade" | "organize";

/** Granularity the list tracks. Each list contains uniformly one kind. */
export type ListKind = "card" | "printing" | "copy";

/**
 * Where an expanded entry came from (ADR-034). `manual` = a real `list_entries`
 * row; `rule` = produced by the list's dynamic rule; `both` = a manual entry the
 * rule also produced (the manual row wins for id/overrides).
 */
export type EntrySource = "manual" | "rule" | "both";

export type ListResponse = z.infer<typeof listResponseSchema>;

export type ListListResponse = z.infer<typeof listListResponseSchema>;

export type ListEntryResponse = z.infer<typeof listEntryResponseSchema>;

/**
 * Enriched entry row. Joined with card/printing/copy details on the server.
 * `printing` and `copy` variants both carry a non-null `printingId` (for copy
 * it's the printing under the physical copy) so the client can look up a
 * thumbnail directly. `card` variant has no printing — the client picks a
 * representative from the catalog.
 */
export type ListEntryDetailResponse = z.infer<typeof listEntryDetailResponseSchema>;

export type ListDetailResponse = z.infer<typeof listDetailResponseSchema>;

/** The list object on a detail response also carries the dynamic rules (ADR-034). */
export type ListDetailListResponse = ListDetailResponse["list"];

export type PublicListResponse = z.infer<typeof publicListResponseSchema>;

export type PublicListDetailResponse = z.infer<typeof publicListDetailResponseSchema>;

export type ListShareResponse = z.infer<typeof listShareResponseSchema>;

export type ListBulkAddResponse = z.infer<typeof listBulkAddResponseSchema>;

export type ListMoveResponse = z.infer<typeof listMoveResponseSchema>;
