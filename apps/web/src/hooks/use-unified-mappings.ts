import { queryOptions, useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { queryKeys } from "@/lib/query-keys";
import { callApi, callApiJson, encodeParams, serverApiClient } from "@/lib/server-fns/api-client";
import type {
  UnifiedMappingsCardResponse,
  UnifiedMappingsResponse,
} from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchUnifiedMappings = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<UnifiedMappingsResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1["marketplace-mappings"].$get(),
        "Couldn't load unified mappings",
      ),
  );

export function unifiedMappingsQueryOptions() {
  return queryOptions({
    queryKey: queryKeys.admin.unifiedMappings.list,
    queryFn: () => fetchUnifiedMappings(),
  });
}

export function useUnifiedMappings() {
  return useSuspenseQuery(unifiedMappingsQueryOptions());
}

const fetchUnifiedMappingsForCard = createServerFn({ method: "GET" })
  .inputValidator((input: { cardId: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<UnifiedMappingsCardResponse> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1["marketplace-mappings"].card[":cardId"].$get({
          param: encodeParams({ cardId: data.cardId }),
        }),
        "Couldn't load marketplace mappings for card",
      ),
  );

export function unifiedMappingsForCardQueryOptions(cardId: string) {
  return queryOptions({
    queryKey: queryKeys.admin.unifiedMappings.byCard(cardId),
    queryFn: () => fetchUnifiedMappingsForCard({ data: { cardId } }),
  });
}

/**
 * Mutations invalidate both the unified query and the per-marketplace queries.
 * @returns A mutation hook that invalidates relevant queries on success.
 */
function useUnifiedMutation<TInput, TResult>(
  marketplace: "tcgplayer" | "cardmarket" | "cardtrader",
  mutationFn: (input: TInput) => Promise<TResult>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.unifiedMappings.all,
      });
      void queryClient.invalidateQueries({
        queryKey: ["admin", marketplace] as const,
      });
    },
  });
}

interface SaveMappingsBody {
  mappings: {
    printingId: string;
    externalId: number;
    /** The marketplace's view of the finish — `normal` / `foil`. */
    finish: string;
    /** `null` for marketplaces that don't expose language as a SKU dimension (CM/TCG). */
    language: string | null;
  }[];
}

const saveMappingsFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      marketplace: "tcgplayer" | "cardmarket" | "cardtrader";
      mappings: {
        printingId: string;
        externalId: number;
        finish: string;
        language: string | null;
      }[];
    }) => input,
  )
  .middleware([withCookies])
  .handler(
    ({
      context,
      data,
    }): Promise<{ saved: number; skipped?: { externalId: number; reason: string }[] }> =>
      callApiJson(
        serverApiClient(context.cookie).api.admin.v1["marketplace-mappings"].$post({
          query: { marketplace: data.marketplace },
          json: { mappings: data.mappings },
        }),
        "Couldn't save mappings",
      ),
  );

export function useUnifiedSaveMappings(marketplace: "tcgplayer" | "cardmarket" | "cardtrader") {
  return useUnifiedMutation(marketplace, async (body: SaveMappingsBody) => {
    const result = await saveMappingsFn({
      data: { marketplace, mappings: body.mappings },
    });
    const typed = result as { saved: number; skipped?: { externalId: number; reason: string }[] };
    if (typed.skipped && typed.skipped.length > 0) {
      for (const s of typed.skipped) {
        toast.error(`#${s.externalId}: ${s.reason}`);
      }
    }
    return result;
  });
}

const ignoreVariantsFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      marketplace: "tcgplayer" | "cardmarket" | "cardtrader";
      products: { externalId: number; finish: string; language: string | null }[];
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["ignored-products"].$post({
        json: {
          level: "variant",
          marketplace: data.marketplace,
          products: data.products,
        },
      }),
      "Couldn't ignore variants",
    );
  });

const ignoreProductsFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      marketplace: "tcgplayer" | "cardmarket" | "cardtrader";
      products: { externalId: number }[];
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["ignored-products"].$post({
        json: {
          level: "product",
          marketplace: data.marketplace,
          products: data.products,
        },
      }),
      "Couldn't ignore products",
    );
  });

/**
 * Level-3 ignore: deny a specific SKU (finish × language) of an upstream product.
 * @returns A mutation hook that posts a batch of variant-level ignores.
 */
export function useUnifiedIgnoreVariants(marketplace: "tcgplayer" | "cardmarket" | "cardtrader") {
  return useUnifiedMutation(
    marketplace,
    async (products: { externalId: number; finish: string; language: string | null }[]) => {
      await ignoreVariantsFn({ data: { marketplace, products } });
    },
  );
}

/**
 * Level-2 ignore: deny an entire upstream product regardless of finish/language.
 * @returns A mutation hook that posts a batch of product-level ignores.
 */
export function useUnifiedIgnoreProducts(marketplace: "tcgplayer" | "cardmarket" | "cardtrader") {
  return useUnifiedMutation(marketplace, async (products: { externalId: number }[]) => {
    await ignoreProductsFn({ data: { marketplace, products } });
  });
}

const assignToCardFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      marketplace: "tcgplayer" | "cardmarket" | "cardtrader";
      externalId: number;
      finish: string;
      language: string | null;
      cardId: string;
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["staging-card-overrides"].$post({
        json: data,
      }),
      "Couldn't assign to card",
    );
  });

export function useUnifiedAssignToCard(marketplace: "tcgplayer" | "cardmarket" | "cardtrader") {
  return useUnifiedMutation(
    marketplace,
    async (override: {
      externalId: number;
      finish: string;
      language: string | null;
      cardId: string;
    }) => {
      await assignToCardFn({ data: { marketplace, ...override } });
    },
  );
}

const unassignFromCardFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      marketplace: "tcgplayer" | "cardmarket" | "cardtrader";
      externalId: number;
      finish: string;
      language: string | null;
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await callApi(
      serverApiClient(context.cookie).api.admin.v1["staging-card-overrides"].$delete({
        // REST-5: query-addressed; omit language when null (no SKU language axis).
        query: {
          marketplace: data.marketplace,
          externalId: String(data.externalId),
          finish: data.finish,
          ...(data.language === null ? {} : { language: data.language }),
        },
      }),
      "Couldn't unassign from card",
    );
  });

export function useUnifiedUnassignFromCard(marketplace: "tcgplayer" | "cardmarket" | "cardtrader") {
  return useUnifiedMutation(
    marketplace,
    async (params: { externalId: number; finish: string; language: string | null }) => {
      await unassignFromCardFn({ data: { marketplace, ...params } });
    },
  );
}
