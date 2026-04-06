import { queryKeys } from "@/lib/query-keys";
import { assertOk, client } from "@/lib/rpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

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
      const res = await client.api.v1.admin.cards[":cardId"].errata.$post({
        param: { cardId },
        json: {
          correctedRulesText,
          correctedEffectText,
          source,
          sourceUrl: sourceUrl ?? null,
          effectiveDate: effectiveDate ?? null,
        },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all, queryKeys.catalog.all],
  });
}

/**
 * Deletes card errata.
 * @returns A mutation that DELETEs `/admin/cards/:id/errata`.
 */
export function useDeleteCardErrata() {
  return useMutationWithInvalidation({
    mutationFn: async ({ cardId }: { cardId: string }) => {
      const res = await client.api.v1.admin.cards[":cardId"].errata.$delete({
        param: { cardId },
      });
      assertOk(res);
    },
    invalidates: [queryKeys.admin.cards.all, queryKeys.catalog.all],
  });
}
