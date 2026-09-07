import type { Marketplace } from "@openrift/shared/types/pricing";

import { cn } from "@/lib/utils";

// Artwork is light-on-transparent, so it's inverted for light mode and left alone in dark.
const MARKETPLACE_ICONS: Record<Marketplace, { src: string; className: string }> = {
  tcgplayer: { src: "/images/external/tcgplayer-38x28.webp", className: "invert dark:invert-0" },
  cardmarket: { src: "/images/external/cardmarket-20x28.webp", className: "invert dark:invert-0" },
  cardtrader: { src: "/images/external/cardtrader-20x28.webp", className: "invert dark:invert-0" },
};

// Defaults to decorative (alt=""); pass `alt` only where the icon is the sole identification.
export function MarketplaceIcon({
  marketplace,
  className,
  alt = "",
}: {
  marketplace: Marketplace;
  className?: string;
  alt?: string;
}) {
  const icon = MARKETPLACE_ICONS[marketplace];
  return <img src={icon.src} alt={alt} className={cn("h-3", icon.className, className)} />;
}
