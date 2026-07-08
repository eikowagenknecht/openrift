import {
  adminIgnoredProductsContract,
  adminStagingCardOverridesContract,
  adminUnifiedMappingsContract,
} from "@openrift/shared/contracts";
import {
  queryOptions,
  useMutation,
  useQuery,
  useSuspenseQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { queryKeys } from "@/lib/query-keys";
import type {
  UnifiedMappingsCardResponse,
  UnifiedMappingsResponse,
} from "@/lib/server-fns/api-types";
import { withCookies } from "@/lib/server-fns/middleware";
import { apiOrpcClient } from "@/lib/server-fns/orpc-client";

const fetchUnifiedMappings = createServerFn({ method: "GET" })
  .middleware([withCookies])
  .handler(
    ({ context }): Promise<UnifiedMappingsResponse> =>
      apiOrpcClient(adminUnifiedMappingsContract, context.cookie).list(),
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

/**
 * Gated variant for pages card-review grant holders share with full admins:
 * the marketplace endpoint 403s for them, so the query only runs when the
 * caller is a full admin and `data` stays undefined otherwise.
 *
 * @returns The unified-mappings query, disabled unless `enabled`.
 */
export function useUnifiedMappingsWhen(enabled: boolean) {
  return useQuery({ ...unifiedMappingsQueryOptions(), enabled });
}

const fetchUnifiedMappingsForCard = createServerFn({ method: "GET" })
  .validator((input: { cardId: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<UnifiedMappingsCardResponse> =>
      apiOrpcClient(adminUnifiedMappingsContract, context.cookie).card({ cardId: data.cardId }),
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
  .validator(
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
      apiOrpcClient(adminUnifiedMappingsContract, context.cookie).save({
        query: { marketplace: data.marketplace },
        body: { mappings: data.mappings },
      }),
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
  .validator(
    (input: {
      marketplace: "tcgplayer" | "cardmarket" | "cardtrader";
      products: { externalId: number; finish: string; language: string | null }[];
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminIgnoredProductsContract, context.cookie).ignore({
      level: "variant",
      marketplace: data.marketplace,
      products: data.products,
    });
  });

const ignoreProductsFn = createServerFn({ method: "POST" })
  .validator(
    (input: {
      marketplace: "tcgplayer" | "cardmarket" | "cardtrader";
      products: { externalId: number }[];
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await apiOrpcClient(adminIgnoredProductsContract, context.cookie).ignore({
      level: "product",
      marketplace: data.marketplace,
      products: data.products,
    });
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
  .validator(
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
    await apiOrpcClient(adminStagingCardOverridesContract, context.cookie).create(data);
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
  .validator(
    (input: {
      marketplace: "tcgplayer" | "cardmarket" | "cardtrader";
      externalId: number;
      finish: string;
      language: string | null;
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    // query-addressed (detailed input); omit language when null (no SKU language axis).
    await apiOrpcClient(adminStagingCardOverridesContract, context.cookie).remove({
      query: {
        marketplace: data.marketplace,
        externalId: data.externalId,
        finish: data.finish,
        ...(data.language === null ? {} : { language: data.language }),
      },
    });
  });

export function useUnifiedUnassignFromCard(marketplace: "tcgplayer" | "cardmarket" | "cardtrader") {
  return useUnifiedMutation(
    marketplace,
    async (params: { externalId: number; finish: string; language: string | null }) => {
      await unassignFromCardFn({ data: { marketplace, ...params } });
    },
  );
}
