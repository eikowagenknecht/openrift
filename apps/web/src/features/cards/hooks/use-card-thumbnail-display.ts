import type { PriceLookup } from "@openrift/shared/types/api/pricing";
import type { Marketplace } from "@openrift/shared/types/pricing";

import { usePrices } from "@/features/cards/hooks/use-prices";
import type { GetStandardArtFallback } from "@/features/cards/hooks/use-standard-art-fallback";
import { useStandardArtFallback } from "@/features/cards/hooks/use-standard-art-fallback";
import { useCoarsePointer } from "@/hooks/use-coarse-pointer";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";
import { compactFormatterForMarketplace } from "@/lib/format";
import { useDisplayStore } from "@/stores/display-store";

export interface CardThumbnailDisplay {
  fancyFan: boolean;
  gridFoil: boolean;
  cardTilt: boolean;
  coarsePointer: boolean;
  domainColors: Record<string, string>;
  finishLabels: Record<string, string>;
  sizeLabels: Record<string, string>;
  rarityLabels: Record<string, string>;
  prices: PriceLookup;
  favoriteMarketplace: Marketplace;
  compactFmt: (n: number) => string;
  getFallbackArt: GetStandardArtFallback;
}

export function useCardThumbnailDisplay(): CardThumbnailDisplay {
  "use memo";
  const fancyFan = useDisplayStore((s) => s.fancyFan);
  const foilEffect = useDisplayStore((s) => s.foilEffect);
  const cardTilt = useDisplayStore((s) => s.cardTilt);
  const marketplaceOrder = useDisplayStore((s) => s.marketplaceOrder);
  const hydrated = useHydrated();
  const coarsePointer = useCoarsePointer();
  const domainColors = useDomainColors();
  const { labels } = useEnumOrders();
  const prices = usePrices();
  const getFallbackArt = useStandardArtFallback();
  const favoriteMarketplace = marketplaceOrder[0] ?? "cardtrader";
  return {
    fancyFan,
    gridFoil: foilEffect && hydrated,
    cardTilt,
    coarsePointer,
    domainColors,
    finishLabels: labels.finishes,
    sizeLabels: labels.cardSizes,
    rarityLabels: labels.rarities,
    prices,
    favoriteMarketplace,
    compactFmt: compactFormatterForMarketplace(favoriteMarketplace),
    getFallbackArt,
  };
}
