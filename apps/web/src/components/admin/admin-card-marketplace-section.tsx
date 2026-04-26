import type {
  AdminMarketplaceName,
  UnifiedMappingGroupResponse,
  UnifiedMappingsCardResponse,
  UnifiedMappingsResponse,
} from "@openrift/shared";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { useUnmapMarketplacePrinting } from "@/hooks/use-admin-card-mutations";
import {
  unifiedMappingsForCardQueryOptions,
  useUnifiedAssignToCard,
  useUnifiedIgnoreProducts,
  useUnifiedIgnoreVariants,
  useUnifiedSaveMappings,
  useUnifiedUnassignFromCard,
} from "@/hooks/use-unified-mappings";
import { queryKeys } from "@/lib/query-keys";

import type { MarketplaceHandlers } from "./marketplace-products-table";
import { collectStrongMappings, MarketplaceProductsTable } from "./marketplace-products-table";
import { computeProductSuggestions } from "./suggest-mapping";

export function AdminCardMarketplaceSection({ cardId }: { cardId: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(unifiedMappingsForCardQueryOptions(cardId));

  // Most actions (ignore, unassign, reassign-to-card) await the invalidations
  // so `.mutate`'s promise only resolves after fresh data has been pulled. The
  // per-card cache is what this page reads; the corpus-wide cache (shared with
  // the /admin/marketplace-mappings page) is invalidated too so it can't
  // disagree with this view after a mutation.
  const mutateOpts = {
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.cards.detail(cardId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.unifiedMappings.all }),
      ]);
    },
  };

  const cardKey = queryKeys.admin.unifiedMappings.byCard(cardId);

  // Optimistic path for suggestion-chip clicks and batch-accept. Without this,
  // chips stay on screen until the unifiedMappings refetch finishes. We fold
  // optimistic updates over the cache so every row visibly assigns right
  // away, then reconcile via a background invalidation. On error we roll back
  // to the pre-batch snapshot, not partway through.
  const applyAssignments =
    (marketplace: AdminMarketplaceName) =>
    (
      mappings: {
        externalId: number;
        finish: string;
        language: string | null;
        printingId: string;
      }[],
    ) => {
      if (mappings.length === 0) {
        return;
      }
      const previous = queryClient.getQueryData<UnifiedMappingsCardResponse>(cardKey);
      if (previous) {
        let next = previous;
        for (const m of mappings) {
          next = applyOptimisticAssignmentForCard(
            next,
            marketplace,
            m.externalId,
            m.finish,
            m.language,
            m.printingId,
          );
        }
        if (next !== previous) {
          queryClient.setQueryData(cardKey, next);
        }
      }
      const save =
        marketplace === "tcgplayer"
          ? tcgSaveMapping
          : marketplace === "cardmarket"
            ? cmSaveMapping
            : ctSaveMapping;
      save.mutate(
        { mappings },
        {
          onError: () => {
            if (previous) {
              queryClient.setQueryData(cardKey, previous);
            }
          },
          onSuccess: () => {
            void queryClient.invalidateQueries({
              queryKey: queryKeys.admin.cards.detail(cardId),
            });
          },
        },
      );
    };

  const assignToPrinting =
    (marketplace: AdminMarketplaceName) =>
    (eid: number, finish: string, language: string | null, pid: string) => {
      applyAssignments(marketplace)([{ externalId: eid, finish, language, printingId: pid }]);
    };

  const tcgIgnoreVariant = useUnifiedIgnoreVariants("tcgplayer");
  const cmIgnoreVariant = useUnifiedIgnoreVariants("cardmarket");
  const ctIgnoreVariant = useUnifiedIgnoreVariants("cardtrader");
  const tcgIgnoreProduct = useUnifiedIgnoreProducts("tcgplayer");
  const cmIgnoreProduct = useUnifiedIgnoreProducts("cardmarket");
  const ctIgnoreProduct = useUnifiedIgnoreProducts("cardtrader");
  const tcgAssignToCard = useUnifiedAssignToCard("tcgplayer");
  const cmAssignToCard = useUnifiedAssignToCard("cardmarket");
  const ctAssignToCard = useUnifiedAssignToCard("cardtrader");
  const tcgUnassign = useUnifiedUnassignFromCard("tcgplayer");
  const cmUnassign = useUnifiedUnassignFromCard("cardmarket");
  const ctUnassign = useUnifiedUnassignFromCard("cardtrader");
  const tcgSaveMapping = useUnifiedSaveMappings("tcgplayer");
  const cmSaveMapping = useUnifiedSaveMappings("cardmarket");
  const ctSaveMapping = useUnifiedSaveMappings("cardtrader");
  const unmapPrinting = useUnmapMarketplacePrinting([
    queryKeys.admin.cards.detail(cardId),
    queryKeys.admin.unifiedMappings.all,
  ]);

  // oxlint-disable-next-line no-empty-function -- default no-op until the effect below installs the real handler
  const acceptAllRef = useRef<() => void>(() => {});
  useHotkey("Mod+Enter", () => acceptAllRef.current(), {
    enabled: !(tcgSaveMapping.isPending || cmSaveMapping.isPending || ctSaveMapping.isPending),
  });
  // Install the latest accept-all closure every render so the hotkey fires
  // against the current data/handlers without needing a stale dep list.
  useEffect(() => {
    const group = data?.group;
    if (!group) {
      // oxlint-disable-next-line no-empty-function -- no-op when there's no data yet
      acceptAllRef.current = () => {};
      return;
    }
    const suggestions = computeProductSuggestions(group);
    const strong = collectStrongMappings(group, suggestions);
    acceptAllRef.current = () => {
      for (const mp of ["tcgplayer", "cardmarket", "cardtrader"] as const) {
        const mappings = strong[mp];
        if (mappings.length > 0) {
          applyAssignments(mp)(mappings);
        }
      }
    };
  });

  if (isLoading || !data) {
    return <Skeleton className="h-40 w-full" />;
  }

  const group = data.group;
  if (!group) {
    return (
      <p className="text-muted-foreground text-sm">No marketplace products linked to this card.</p>
    );
  }

  const handlers: Record<AdminMarketplaceName, MarketplaceHandlers> = {
    tcgplayer: {
      onIgnoreVariant: (eid, fin, lang) =>
        tcgIgnoreVariant.mutate([{ externalId: eid, finish: fin, language: lang }], mutateOpts),
      onIgnoreProduct: (eid) => tcgIgnoreProduct.mutate([{ externalId: eid }], mutateOpts),
      onAssignToCard: (eid, fin, lang, cid) =>
        tcgAssignToCard.mutate(
          { externalId: eid, finish: fin, language: lang, cardId: cid },
          mutateOpts,
        ),
      onAssignToPrinting: assignToPrinting("tcgplayer"),
      onBatchAssignToPrintings: applyAssignments("tcgplayer"),
      onUnassign: (eid, fin, lang) =>
        tcgUnassign.mutate({ externalId: eid, finish: fin, language: lang }, mutateOpts),
      onUnmapPrinting: (pid, eid) =>
        unmapPrinting.mutate(
          { marketplace: "tcgplayer", printingId: pid, externalId: eid },
          mutateOpts,
        ),
      isIgnoring: tcgIgnoreVariant.isPending || tcgIgnoreProduct.isPending,
      isAssigning: tcgAssignToCard.isPending,
      isAssigningToPrinting: tcgSaveMapping.isPending,
      isUnassigning: tcgUnassign.isPending,
      isUnmappingPrinting: unmapPrinting.isPending,
    },
    cardmarket: {
      onIgnoreVariant: (eid, fin, lang) =>
        cmIgnoreVariant.mutate([{ externalId: eid, finish: fin, language: lang }], mutateOpts),
      onIgnoreProduct: (eid) => cmIgnoreProduct.mutate([{ externalId: eid }], mutateOpts),
      onAssignToCard: (eid, fin, lang, cid) =>
        cmAssignToCard.mutate(
          { externalId: eid, finish: fin, language: lang, cardId: cid },
          mutateOpts,
        ),
      onAssignToPrinting: assignToPrinting("cardmarket"),
      onBatchAssignToPrintings: applyAssignments("cardmarket"),
      onUnassign: (eid, fin, lang) =>
        cmUnassign.mutate({ externalId: eid, finish: fin, language: lang }, mutateOpts),
      onUnmapPrinting: (pid, eid) =>
        unmapPrinting.mutate(
          { marketplace: "cardmarket", printingId: pid, externalId: eid },
          mutateOpts,
        ),
      isIgnoring: cmIgnoreVariant.isPending || cmIgnoreProduct.isPending,
      isAssigning: cmAssignToCard.isPending,
      isAssigningToPrinting: cmSaveMapping.isPending,
      isUnassigning: cmUnassign.isPending,
      isUnmappingPrinting: unmapPrinting.isPending,
    },
    cardtrader: {
      onIgnoreVariant: (eid, fin, lang) =>
        ctIgnoreVariant.mutate([{ externalId: eid, finish: fin, language: lang }], mutateOpts),
      onIgnoreProduct: (eid) => ctIgnoreProduct.mutate([{ externalId: eid }], mutateOpts),
      onAssignToCard: (eid, fin, lang, cid) =>
        ctAssignToCard.mutate(
          { externalId: eid, finish: fin, language: lang, cardId: cid },
          mutateOpts,
        ),
      onAssignToPrinting: assignToPrinting("cardtrader"),
      onBatchAssignToPrintings: applyAssignments("cardtrader"),
      onUnassign: (eid, fin, lang) =>
        ctUnassign.mutate({ externalId: eid, finish: fin, language: lang }, mutateOpts),
      onUnmapPrinting: (pid, eid) =>
        unmapPrinting.mutate(
          { marketplace: "cardtrader", printingId: pid, externalId: eid },
          mutateOpts,
        ),
      isIgnoring: ctIgnoreVariant.isPending || ctIgnoreProduct.isPending,
      isAssigning: ctAssignToCard.isPending,
      isAssigningToPrinting: ctSaveMapping.isPending,
      isUnassigning: ctUnassign.isPending,
      isUnmappingPrinting: unmapPrinting.isPending,
    },
  };

  const suggestions = computeProductSuggestions(group);

  return (
    <MarketplaceProductsTable
      group={group}
      allCards={data.allCards}
      handlers={handlers}
      suggestions={suggestions}
    />
  );
}

/**
 * Return a new group with a single (product SKU → printing) assignment
 * applied: the matching staged product becomes assigned, and the assignment
 * row is appended. The SKU is identified by the exact `(externalId, finish,
 * language)` tuple the caller passes through — finish/language describe the
 * marketplace's view of the SKU, not the printing's.
 * @returns The updated group, or the original when nothing changed.
 */
function applyOptimisticAssignmentToGroup(
  group: UnifiedMappingGroupResponse,
  marketplace: AdminMarketplaceName,
  externalId: number,
  finish: string,
  language: string | null,
  printingId: string,
): UnifiedMappingGroupResponse {
  const printing = group.printings.find((p) => p.printingId === printingId);
  if (!printing) {
    return group;
  }
  const mk = group[marketplace];
  const variantIdx = mk.stagedProducts.findIndex(
    (p) => p.externalId === externalId && p.finish === finish && p.language === language,
  );
  const variant = variantIdx === -1 ? undefined : mk.stagedProducts[variantIdx];
  const nextStaged =
    variantIdx === -1
      ? mk.stagedProducts
      : [...mk.stagedProducts.slice(0, variantIdx), ...mk.stagedProducts.slice(variantIdx + 1)];
  const nextAssigned = variant ? [...mk.assignedProducts, variant] : mk.assignedProducts;
  const nextAssignments = [
    ...mk.assignments,
    {
      externalId,
      printingId,
      finish,
      language,
    },
  ];
  return {
    ...group,
    [marketplace]: {
      ...mk,
      stagedProducts: nextStaged,
      assignedProducts: nextAssigned,
      assignments: nextAssignments,
    },
  };
}

/**
 * Corpus-wide version of {@link applyOptimisticAssignmentToGroup} that locates
 * the target card inside the full {@link UnifiedMappingsResponse}. Kept
 * exported so the /admin/marketplace-mappings page can reuse the same logic.
 * @returns The updated response, or the original when nothing changed.
 */
export function applyOptimisticAssignment(
  response: UnifiedMappingsResponse,
  cardId: string,
  marketplace: AdminMarketplaceName,
  externalId: number,
  finish: string,
  language: string | null,
  printingId: string,
): UnifiedMappingsResponse {
  const groupIdx = response.groups.findIndex((g) => g.cardId === cardId);
  if (groupIdx === -1) {
    return response;
  }
  const group = response.groups[groupIdx];
  const nextGroup = applyOptimisticAssignmentToGroup(
    group,
    marketplace,
    externalId,
    finish,
    language,
    printingId,
  );
  if (nextGroup === group) {
    return response;
  }
  return {
    ...response,
    groups: [
      ...response.groups.slice(0, groupIdx),
      nextGroup,
      ...response.groups.slice(groupIdx + 1),
    ],
  };
}

/**
 * Per-card variant of {@link applyOptimisticAssignment} for the card-detail
 * page's {@link UnifiedMappingsCardResponse} cache entry.
 * @returns The updated response, or the original when nothing changed.
 */
export function applyOptimisticAssignmentForCard(
  response: UnifiedMappingsCardResponse,
  marketplace: AdminMarketplaceName,
  externalId: number,
  finish: string,
  language: string | null,
  printingId: string,
): UnifiedMappingsCardResponse {
  if (!response.group) {
    return response;
  }
  const nextGroup = applyOptimisticAssignmentToGroup(
    response.group,
    marketplace,
    externalId,
    finish,
    language,
    printingId,
  );
  if (nextGroup === response.group) {
    return response;
  }
  return { ...response, group: nextGroup };
}
