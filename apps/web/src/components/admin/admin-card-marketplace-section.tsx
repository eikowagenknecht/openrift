import type {
  AdminMarketplaceName,
  UnifiedMappingGroupResponse,
  UnifiedMappingsCardResponse,
  UnifiedMappingsResponse,
} from "@openrift/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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
import { MarketplaceProductsTable } from "./marketplace-products-table";
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

  // Optimistic path for suggestion-chip clicks. Without this, the chip stays
  // on screen until the unifiedMappings refetch finishes. We flip the cache
  // synchronously so the row visibly assigns right away, then reconcile via a
  // background invalidation. On error we roll back.
  const assignToPrinting = (marketplace: AdminMarketplaceName) => (eid: number, pid: string) => {
    const previous = queryClient.getQueryData<UnifiedMappingsCardResponse>(cardKey);
    if (previous) {
      const next = applyOptimisticAssignmentForCard(previous, marketplace, eid, pid);
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
      { mappings: [{ printingId: pid, externalId: eid }] },
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
      onUnassign: (eid, fin, lang) =>
        tcgUnassign.mutate({ externalId: eid, finish: fin, language: lang }, mutateOpts),
      onUnmapPrinting: (pid) =>
        unmapPrinting.mutate({ marketplace: "tcgplayer", printingId: pid }, mutateOpts),
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
      onUnassign: (eid, fin, lang) =>
        cmUnassign.mutate({ externalId: eid, finish: fin, language: lang }, mutateOpts),
      onUnmapPrinting: (pid) =>
        unmapPrinting.mutate({ marketplace: "cardmarket", printingId: pid }, mutateOpts),
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
      onUnassign: (eid, fin, lang) =>
        ctUnassign.mutate({ externalId: eid, finish: fin, language: lang }, mutateOpts),
      onUnmapPrinting: (pid) =>
        unmapPrinting.mutate({ marketplace: "cardtrader", printingId: pid }, mutateOpts),
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
 * Return a new group with a single (externalId → printing) assignment applied:
 * the matching staged product becomes assigned, and the assignment row is
 * appended. Cardmarket stores language-aggregate so the assignment row uses
 * null; CT/TCG pin the printing's language. Returns the original group
 * unchanged when the printing or matching staged variant can't be resolved.
 * @returns The updated group, or the original when nothing changed.
 */
function applyOptimisticAssignmentToGroup(
  group: UnifiedMappingGroupResponse,
  marketplace: AdminMarketplaceName,
  externalId: number,
  printingId: string,
): UnifiedMappingGroupResponse {
  const printing = group.printings.find((p) => p.printingId === printingId);
  if (!printing) {
    return group;
  }
  const mk = group[marketplace];
  const variantIdx = mk.stagedProducts.findIndex((p) => {
    if (p.externalId !== externalId) {
      return false;
    }
    if (p.finish !== printing.finish) {
      return false;
    }
    // Cardmarket staging is language-aggregate (staging is always placeholder
    // EN regardless of the physical card's language). For TCG/CT, the staged
    // variant must match the printing's language.
    return marketplace === "cardmarket" || p.language === printing.language;
  });
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
      finish: printing.finish,
      language: marketplace === "cardmarket" ? null : (variant?.language ?? printing.language),
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
  printingId: string,
): UnifiedMappingsResponse {
  const groupIdx = response.groups.findIndex((g) => g.cardId === cardId);
  if (groupIdx === -1) {
    return response;
  }
  const group = response.groups[groupIdx];
  const nextGroup = applyOptimisticAssignmentToGroup(group, marketplace, externalId, printingId);
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
  printingId: string,
): UnifiedMappingsCardResponse {
  if (!response.group) {
    return response;
  }
  const nextGroup = applyOptimisticAssignmentToGroup(
    response.group,
    marketplace,
    externalId,
    printingId,
  );
  if (nextGroup === response.group) {
    return response;
  }
  return { ...response, group: nextGroup };
}
