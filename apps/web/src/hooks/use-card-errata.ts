import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { API_URL } from "@/lib/server-fns/api-url";
import { fetchApi } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const upsertCardErrataFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      cardId: string;
      correctedRulesText: string | null;
      correctedEffectText: string | null;
      source: string;
      sourceUrl?: string | null;
      effectiveDate?: string | null;
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't upsert card errata",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/${encodeURIComponent(data.cardId)}/errata`,
      method: "POST",
      body: {
        correctedRulesText: data.correctedRulesText,
        correctedEffectText: data.correctedEffectText,
        source: data.source,
        sourceUrl: data.sourceUrl ?? null,
        effectiveDate: data.effectiveDate ?? null,
      },
    });
  });

/**
 * Upserts card errata (creates or replaces).
 * @returns A mutation that POSTs to `/admin/cards/:id/errata`.
 */
export function useUpsertCardErrata() {
  return useMutationWithInvalidation({
    mutationFn: async ({
      cardId,
      correctedRulesText,
      correctedEffectText,
      source,
      sourceUrl,
      effectiveDate,
    }: {
      cardId: string;
      correctedRulesText: string | null;
      correctedEffectText: string | null;
      source: string;
      sourceUrl?: string | null;
      effectiveDate?: string | null;
    }) => {
      await upsertCardErrataFn({
        data: { cardId, correctedRulesText, correctedEffectText, source, sourceUrl, effectiveDate },
      });
    },
    invalidates: [queryKeys.admin.cards.all, queryKeys.catalog.all],
  });
}

const deleteCardErrataFn = createServerFn({ method: "POST" })
  .inputValidator((input: { cardId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't delete card errata",
      cookie: context.cookie,
      path: `/api/v1/admin/cards/${encodeURIComponent(data.cardId)}/errata`,
      method: "DELETE",
    });
  });

/**
 * Deletes card errata.
 * @returns A mutation that DELETEs `/admin/cards/:id/errata`.
 */
export function useDeleteCardErrata() {
  return useMutationWithInvalidation({
    mutationFn: async ({ cardId }: { cardId: string }) => {
      await deleteCardErrataFn({ data: { cardId } });
    },
    invalidates: [queryKeys.admin.cards.all, queryKeys.catalog.all],
  });
}

export interface BulkErrataEntry {
  cardSlug: string;
  correctedRulesText?: string | null;
  correctedEffectText?: string | null;
  source: string;
  sourceUrl?: string | null;
  effectiveDate?: string | null;
}

interface BulkErrataUploadBody {
  dryRun: boolean;
  entries: BulkErrataEntry[];
}

interface EntryRef {
  cardSlug: string;
  cardName: string;
}

interface EntryDiff extends EntryRef {
  fields: { field: string; from: string | null; to: string | null }[];
}

export interface BulkErrataUploadResponse {
  dryRun: boolean;
  newCount: number;
  updatedCount: number;
  unchangedCount: number;
  matchesPrintedCount: number;
  errors: string[];
  newEntries: EntryRef[];
  updatedEntries: EntryDiff[];
  skippedMatchesPrinted: EntryRef[];
}

// TODO: migrate to fetchApi — this endpoint extracts a specific `body.error`
// text from the API response for the user-facing toast, which the helper
// would replace with the generic errorTitle.
const uploadErrataFn = createServerFn({ method: "POST" })
  .inputValidator((input: BulkErrataUploadBody) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/cards/errata/upload`, {
      method: "POST",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `Upload errata failed: ${res.status}`);
    }
    return (await res.json()) as BulkErrataUploadResponse;
  });

/**
 * Bulk-upload card errata from a JSON payload.
 * @returns A mutation that POSTs to `/admin/cards/errata/upload`.
 */
export function useUploadErrata() {
  return useMutationWithInvalidation({
    mutationFn: (payload: BulkErrataUploadBody) => uploadErrataFn({ data: payload }),
    invalidates: [queryKeys.admin.cards.all, queryKeys.catalog.all],
  });
}
