import type { Marketplace } from "@openrift/shared";
import { MARKETPLACE_LINKS } from "@openrift/shared";

interface MarketplaceMeta {
  label: string;
  icon: string;
  searchUrl: (query: string) => string;
  productUrl: (productId: number, language?: string | null) => string;
}

const MARKETPLACE_ICONS: Record<Marketplace, string> = {
  tcgplayer: "/images/external/tcgplayer-38x28.webp",
  cardmarket: "/images/external/cardmarket-20x28.webp",
  cardtrader: "/images/external/cardtrader-20x28.webp",
};

export const MARKETPLACE_META: Record<Marketplace, MarketplaceMeta> = Object.fromEntries(
  Object.entries(MARKETPLACE_LINKS).map(([marketplace, links]) => [
    marketplace,
    { ...links, icon: MARKETPLACE_ICONS[marketplace as Marketplace] },
  ]),
) as Record<Marketplace, MarketplaceMeta>;
