import type { AdminMarketplaceName } from "@openrift/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Skeleton } from "@/components/ui/skeleton";
import { useUnmapMarketplacePrinting } from "@/hooks/use-admin-card-mutations";
import {
  unifiedMappingsQueryOptions,
  useUnifiedAssignToCard,
  useUnifiedIgnoreProducts,
  useUnifiedIgnoreVariants,
  useUnifiedSaveMappings,
  useUnifiedUnassignFromCard,
} from "@/hooks/use-unified-mappings";
import { queryKeys } from "@/lib/query-keys";

import type { MarketplaceHandlers } from "./marketplace-products-table";
import { MarketplaceProductsTable } from "./marketplace-products-table";

export function AdminCardMarketplaceSection({ cardId }: { cardId: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(unifiedMappingsQueryOptions(true));

  // Every mutation on this section can affect both the unified mappings table
  // (this section) and the per-printing marketplace cells below. Await the
  // invalidations so `.mutate`'s promise only resolves after the fresh data
  // has been pulled — keeps the UI consistent even if the hook-level
  // invalidation hasn't finished yet.
  const mutateOpts = {
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.cards.detail(cardId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.admin.unifiedMappings.all }),
      ]);
    },
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

  const group = data.groups.find((g) => g.cardId === cardId);
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
      onAssignToPrinting: (eid, pid) =>
        tcgSaveMapping.mutate({ mappings: [{ printingId: pid, externalId: eid }] }, mutateOpts),
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
      onAssignToPrinting: (eid, pid) =>
        cmSaveMapping.mutate({ mappings: [{ printingId: pid, externalId: eid }] }, mutateOpts),
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
      onAssignToPrinting: (eid, pid) =>
        ctSaveMapping.mutate({ mappings: [{ printingId: pid, externalId: eid }] }, mutateOpts),
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

  return <MarketplaceProductsTable group={group} allCards={data.allCards} handlers={handlers} />;
}
