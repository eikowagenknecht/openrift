import { adminCardMutationsContract } from "@openrift/shared/contracts/admin/card-mutations";
import type { UploadErrataResponse } from "@openrift/shared/contracts/admin/card-mutations";
import { createServerFn } from "@tanstack/react-start";

import { queryKeys } from "@/lib/query-keys";
import { withCookies } from "@/lib/server-fns/middleware";
import type { ContractInput } from "@/lib/server-fns/orpc-client";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";
import { useMutationWithInvalidation } from "@/lib/use-mutation-with-invalidation";

type BulkErrataUploadBody = ContractInput<typeof adminCardMutationsContract, "uploadErrata">;

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
    await apiOrpcClient(adminCardMutationsContract, context.cookie).upsertErrata({
      cardId: data.cardId,
      correctedRulesText: data.correctedRulesText,
      correctedEffectText: data.correctedEffectText,
      source: data.source,
      sourceUrl: data.sourceUrl ?? null,
      effectiveDate: data.effectiveDate ?? null,
    });
  });

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
    await apiOrpcClient(adminCardMutationsContract, context.cookie).deleteErrata({
      cardId: data.cardId,
    });
  });

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

const uploadErrataFn = createServerFn({ method: "POST" })
  .validator((input: BulkErrataUploadBody) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<UploadErrataResponse> =>
    apiOrpcClient(adminCardMutationsContract, context.cookie).uploadErrata(data),
  );

export function useUploadErrata() {
  return useMutationWithInvalidation({
    mutationFn: (payload: BulkErrataUploadBody) => uploadErrataFn({ data: payload }),
    invalidates: [queryKeys.admin.cards.all, queryKeys.catalog.all],
  });
}
