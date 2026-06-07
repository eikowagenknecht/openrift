import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import { withCookies } from "@/lib/server-fns/middleware";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

const upsertCardErrataFn = createServerFn({ method: "POST" })
  .validator(
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
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.cards[":cardId"].errata.$post({
        param: encodeParams({ cardId: data.cardId }),
        json: {
          correctedRulesText: data.correctedRulesText,
          correctedEffectText: data.correctedEffectText,
          source: data.source,
          sourceUrl: data.sourceUrl ?? null,
          effectiveDate: data.effectiveDate ?? null,
        },
      }),
      "Couldn't upsert card errata",
    );
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
  .validator((input: { cardId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1.cards[":cardId"].errata.$delete({
        param: encodeParams({ cardId: data.cardId }),
      }),
      "Couldn't delete card errata",
    );
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

const uploadErrataFn = createServerFn({ method: "POST" })
  .validator((input: BulkErrataUploadBody) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<BulkErrataUploadResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1.cards.errata.upload.$post({ json: data }),
        "Couldn't upload errata",
      ),
  );

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
