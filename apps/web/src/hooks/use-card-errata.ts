import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { callApi, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import { fetchApiJson } from "@/lib/server-fns/fetch-api";
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
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.cards[":cardId"].errata.$post({
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
  .inputValidator((input: { cardId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.v1.admin.cards[":cardId"].errata.$delete({
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

// TODO(sweep): migrate to hc. The 200 body's `updatedEntries[].fields[].from`/`.to`
// are `z.unknown()` in the route, so hc infers them as `unknown`, which is not
// assignable to this fn's `BulkErrataUploadResponse` annotation (`from`/`to` typed
// `string | null`). Resolve by tightening the route schema (e.g. `z.string().nullable()`)
// before switching to callApiJson.
const uploadErrataFn = createServerFn({ method: "POST" })
  .inputValidator((input: BulkErrataUploadBody) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<BulkErrataUploadResponse> =>
      fetchApiJson<BulkErrataUploadResponse>({
        errorTitle: "Couldn't upload errata",
        cookie: context.cookie,
        path: "/api/v1/admin/cards/errata/upload",
        method: "POST",
        body: data,
      }),
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
