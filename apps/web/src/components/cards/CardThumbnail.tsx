import type { Card } from "@openrift/shared";

import { CardPlaceholderImage, DOMAIN_COLORS } from "@/components/cards/CardPlaceholderImage";
import { formatCollectorNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

interface CardThumbnailProps {
  card: Card;
  onClick: (card: Card) => void;
  showImages?: boolean;
  isSelected?: boolean;
}

function getDomainStyle(faction: string): React.CSSProperties {
  const domains = faction.split("/");
  const c1 = DOMAIN_COLORS[domains[0]] ?? "#737373";
  if (domains.length === 1) {
    return { backgroundColor: `${c1}38` };
  }
  const c2 = DOMAIN_COLORS[domains[1]] ?? "#737373";
  return { background: `linear-gradient(135deg, ${c1}38 50%, ${c2}38 50%)` };
}

export function CardThumbnail({ card, onClick, showImages, isSelected }: CardThumbnailProps) {
  const setNumber = formatCollectorNumber(card);
  const thumbnailUrl =
    showImages && card.art.thumbnailURL
      ? `${card.art.thumbnailURL}?w=300&fit=max&fm=webp${card.orientation === "landscape" ? "&or=270" : ""}`
      : null;

  return (
    <button
      type="button"
      className={cn(
        "group relative w-full cursor-pointer rounded-lg p-1.5 text-left transition-all hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      )}
      style={isSelected ? getDomainStyle(card.faction) : undefined}
      onClick={() => onClick(card)}
    >
      <div className="relative">
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={card.name}
            loading="lazy"
            className="aspect-[744/1039] w-full rounded-lg object-cover"
          />
        ) : (
          <CardPlaceholderImage
            name={card.name}
            domain={card.faction}
            energy={card.stats.energy}
            might={card.stats.might}
          />
        )}
      </div>
      <div className="mt-1.5 space-y-0.5 px-0.5">
        <p className="truncate text-xs font-medium sm:text-sm">
          <span className="text-muted-foreground">{setNumber}</span> {card.name}
        </p>
        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
          <img
            src={`/icons/types/${card.type.toLowerCase()}.svg`}
            alt=""
            className="size-3.5 brightness-0 dark:invert"
          />
          {card.type}
          <span>&middot;</span>
          <img
            src={`/icons/rarities/${card.rarity.toLowerCase()}.webp`}
            alt=""
            className="size-3.5"
          />
          {card.rarity}
        </p>
      </div>
    </button>
  );
}
