import type { UnifiedMappingsCardResponse, UnifiedMappingsResponse } from "@openrift/shared";
import { queryOptions, useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { queryKeys } from "@/lib/query-keys";
import { fetchApi, fetchApiJson } from "@/lib/server-fns/fetch-api";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchUnifiedMappings = createServerFn({ method: "GET" })
  .inputValidator((input: { showAll: boolean }) => input)
  .middleware([withCookies])
  .handler(({ context, data }): Promise<UnifiedMappingsResponse> => {
    const params = new URLSearchParams();
    if (data.showAll) {
      params.set("all", "true");
    }
    const qs = params.toString();
    return fetchApiJson<UnifiedMappingsResponse>({
      errorTitle: "Couldn't load unified mappings",
      cookie: context.cookie,
      path: `/api/v1/admin/marketplace-mappings${qs ? `?${qs}` : ""}`,
    });
  });

export function unifiedMappingsQueryOptions(showAll = false) {
  return queryOptions({
    queryKey: queryKeys.admin.unifiedMappings.byFilter(showAll),
    queryFn: () => fetchUnifiedMappings({ data: { showAll } }),
  });
}

export function useUnifiedMappings(showAll = false) {
  return useSuspenseQuery(unifiedMappingsQueryOptions(showAll));
}

const fetchUnifiedMappingsForCard = createServerFn({ method: "GET" })
  .inputValidator((input: { cardId: string }) => input)
  .middleware([withCookies])
  .handler(
    ({ context, data }): Promise<UnifiedMappingsCardResponse> =>
      fetchApiJson<UnifiedMappingsCardResponse>({
        errorTitle: "Couldn't load marketplace mappings for card",
        cookie: context.cookie,
        path: `/api/v1/admin/marketplace-mappings/card/${encodeURIComponent(data.cardId)}`,
      }),
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
  mappings: { printingId: string; externalId: number }[];
}

const saveMappingsFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { marketplace: string; mappings: { printingId: string; externalId: number }[] }) =>
      input,
  )
  .middleware([withCookies])
  .handler(({ context, data }) =>
    fetchApiJson<{ saved: number; skipped?: { externalId: number; reason: string }[] }>({
      errorTitle: "Couldn't save mappings",
      cookie: context.cookie,
      path: `/api/v1/admin/marketplace-mappings?marketplace=${encodeURIComponent(data.marketplace)}`,
      method: "POST",
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

const unmapPrintingFn = createServerFn({ method: "POST" })
  .inputValidator((input: { marketplace: string; printingId: string }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't unmap printing",
      cookie: context.cookie,
      path: `/api/v1/admin/marketplace-mappings?marketplace=${encodeURIComponent(data.marketplace)}`,
      method: "DELETE",
      body: { printingId: data.printingId },
    });
  });

export function useUnifiedUnmapPrinting(marketplace: "tcgplayer" | "cardmarket" | "cardtrader") {
  return useUnifiedMutation(marketplace, async (printingId: string) => {
    await unmapPrintingFn({ data: { marketplace, printingId } });
  });
}

const ignoreVariantsFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      marketplace: string;
      products: { externalId: number; finish: string; language: string }[];
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't ignore variants",
      cookie: context.cookie,
      path: "/api/v1/admin/ignored-products",
      method: "POST",
      body: {
        level: "variant",
        marketplace: data.marketplace,
        products: data.products,
      },
    });
  });

const ignoreProductsFn = createServerFn({ method: "POST" })
  .inputValidator((input: { marketplace: string; products: { externalId: number }[] }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't ignore products",
      cookie: context.cookie,
      path: "/api/v1/admin/ignored-products",
      method: "POST",
      body: {
        level: "product",
        marketplace: data.marketplace,
        products: data.products,
      },
    });
  });

/**
 * Level-3 ignore: deny a specific SKU (finish × language) of an upstream product.
 * @returns A mutation hook that posts a batch of variant-level ignores.
 */
export function useUnifiedIgnoreVariants(marketplace: "tcgplayer" | "cardmarket" | "cardtrader") {
  return useUnifiedMutation(
    marketplace,
    async (products: { externalId: number; finish: string; language: string }[]) => {
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
      marketplace: string;
      externalId: number;
      finish: string;
      language: string;
      cardId: string;
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't assign to card",
      cookie: context.cookie,
      path: "/api/v1/admin/staging-card-overrides",
      method: "POST",
      body: data,
    });
  });

export function useUnifiedAssignToCard(marketplace: "tcgplayer" | "cardmarket" | "cardtrader") {
  return useUnifiedMutation(
    marketplace,
    async (override: { externalId: number; finish: string; language: string; cardId: string }) => {
      await assignToCardFn({ data: { marketplace, ...override } });
    },
  );
}

const unassignFromCardFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { marketplace: string; externalId: number; finish: string; language: string }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    await fetchApi({
      errorTitle: "Couldn't unassign from card",
      cookie: context.cookie,
      path: "/api/v1/admin/staging-card-overrides",
      method: "DELETE",
      body: data,
    });
  });

export function useUnifiedUnassignFromCard(marketplace: "tcgplayer" | "cardmarket" | "cardtrader") {
  return useUnifiedMutation(
    marketplace,
    async (params: { externalId: number; finish: string; language: string }) => {
      await unassignFromCardFn({ data: { marketplace, ...params } });
    },
  );
}
