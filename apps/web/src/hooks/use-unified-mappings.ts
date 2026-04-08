import type { UnifiedMappingsResponse } from "@openrift/shared";
import { queryOptions, useMutation, useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { queryKeys } from "@/lib/query-keys";
import { API_URL } from "@/lib/server-fns/api-url";
import { withCookies } from "@/lib/server-fns/middleware";

const fetchUnifiedMappings = createServerFn({ method: "GET" })
  .inputValidator((input: { showAll: boolean }) => input)
  .middleware([withCookies])
  .handler(async ({ context, data }): Promise<UnifiedMappingsResponse> => {
    const params = new URLSearchParams();
    if (data.showAll) {
      params.set("all", "true");
    }
    const qs = params.toString();
    const url = `${API_URL}/api/v1/admin/marketplace-mappings${qs ? `?${qs}` : ""}`;
    const res = await fetch(url, {
      headers: { cookie: context.cookie },
    });
    if (!res.ok) {
      throw new Error(`Unified mappings fetch failed: ${res.status}`);
    }
    return res.json() as Promise<UnifiedMappingsResponse>;
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
  .handler(async ({ context, data }) => {
    const res = await fetch(
      `${API_URL}/api/v1/admin/marketplace-mappings?marketplace=${encodeURIComponent(data.marketplace)}`,
      {
        method: "POST",
        headers: { cookie: context.cookie, "content-type": "application/json" },
        body: JSON.stringify({ mappings: data.mappings }),
      },
    );
    if (!res.ok) {
      throw new Error(`Save mappings failed: ${res.status}`);
    }
    return res.json();
  });

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
    const res = await fetch(
      `${API_URL}/api/v1/admin/marketplace-mappings?marketplace=${encodeURIComponent(data.marketplace)}`,
      {
        method: "DELETE",
        headers: { cookie: context.cookie, "content-type": "application/json" },
        body: JSON.stringify({ printingId: data.printingId }),
      },
    );
    if (!res.ok) {
      throw new Error(`Unmap printing failed: ${res.status}`);
    }
  });

export function useUnifiedUnmapPrinting(marketplace: "tcgplayer" | "cardmarket" | "cardtrader") {
  return useUnifiedMutation(marketplace, async (printingId: string) => {
    await unmapPrintingFn({ data: { marketplace, printingId } });
  });
}

const ignoreProductsFn = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      marketplace: string;
      products: { externalId: number; finish: string; language: string }[];
    }) => input,
  )
  .middleware([withCookies])
  .handler(async ({ context, data }) => {
    const res = await fetch(`${API_URL}/api/v1/admin/ignored-products`, {
      method: "POST",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify({ marketplace: data.marketplace, products: data.products }),
    });
    if (!res.ok) {
      throw new Error(`Ignore products failed: ${res.status}`);
    }
  });

export function useUnifiedIgnoreProducts(marketplace: "tcgplayer" | "cardmarket" | "cardtrader") {
  return useUnifiedMutation(
    marketplace,
    async (products: { externalId: number; finish: string; language: string }[]) => {
      await ignoreProductsFn({ data: { marketplace, products } });
    },
  );
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
    const res = await fetch(`${API_URL}/api/v1/admin/staging-card-overrides`, {
      method: "POST",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`Assign to card failed: ${res.status}`);
    }
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
    const res = await fetch(`${API_URL}/api/v1/admin/staging-card-overrides`, {
      method: "DELETE",
      headers: { cookie: context.cookie, "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      throw new Error(`Unassign from card failed: ${res.status}`);
    }
  });

export function useUnifiedUnassignFromCard(marketplace: "tcgplayer" | "cardmarket" | "cardtrader") {
  return useUnifiedMutation(
    marketplace,
    async (params: { externalId: number; finish: string; language: string }) => {
      await unassignFromCardFn({ data: { marketplace, ...params } });
    },
  );
}
