import type { Marketplace } from "@openrift/shared";

import { cn } from "@/lib/utils";

// The artwork is light-on-transparent, so it needs inverting for light mode and
// leaving alone in dark. TCGplayer's mark is wider than the other two (38x28
// against 20x28), so icons sized by height come out at different widths.
const MARKETPLACE_ICONS: Record<Marketplace, { src: string; className: string }> = {
  tcgplayer: { src: "/images/external/tcgplayer-38x28.webp", className: "invert dark:invert-0" },
  cardmarket: { src: "/images/external/cardmarket-20x28.webp", className: "invert dark:invert-0" },
  cardtrader: { src: "/images/external/cardtrader-20x28.webp", className: "invert dark:invert-0" },
};

/**
 * A marketplace's logo, sized by height so it works inline in chips and
 * toggles. Defaults to decorative (`alt=""`) — pass `alt` only where the icon
 * is the sole identification and no surrounding label or `aria-label` names it.
 * @returns The logo image.
 */
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
