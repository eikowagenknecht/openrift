import type { CardType, Rarity } from "@openrift/shared";

import { cn } from "@/lib/utils";

const domainColors: Record<string, string> = {
  Fury: "bg-red-600 dark:bg-red-700",
  Calm: "bg-sky-500 dark:bg-sky-600",
  Mind: "bg-violet-500 dark:bg-violet-600",
  Body: "bg-emerald-600 dark:bg-emerald-700",
  Chaos: "bg-rose-700 dark:bg-rose-800",
  Order: "bg-amber-500 dark:bg-amber-600",
};

interface CardPlaceholderImageProps {
  name: string;
  rarity: Rarity;
  type: CardType;
  domain: string;
  cost: number;
  attack?: number | null;
  className?: string;
}

export function CardPlaceholderImage({
  name,
  rarity,
  type,
  domain,
  cost,
  attack,
  className,
}: CardPlaceholderImageProps) {
  const bgColor = domainColors[domain] ?? "bg-neutral-500 dark:bg-neutral-600";

  return (
    <div
      className={cn(
        "relative flex aspect-[2/3] items-center justify-center overflow-hidden rounded-lg",
        bgColor,
        className,
      )}
    >
      {/* Top-left: cost circle + domain icon below */}
      <div className="absolute top-2 left-2 flex flex-col items-center gap-1">
        <div className="flex size-8 items-center justify-center rounded-full bg-black/70 text-sm font-bold text-white">
          {cost}
        </div>
        <img src={`/icons/domains/${domain}.webp`} alt={domain} className="size-6 drop-shadow-md" />
      </div>

      {/* Top-right: strength (attack) */}
      {attack != null && (
        <div className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-black/70 text-sm font-bold text-white">
          {attack}
        </div>
      )}

      {/* Bottom-left: type + rarity icons */}
      <div className="absolute bottom-2 left-2 flex items-center gap-1">
        <img
          src={`/icons/types/${type.toLowerCase()}.webp`}
          alt={type}
          className="size-5 drop-shadow-md"
        />
        <img
          src={`/icons/rarities/${rarity.toLowerCase()}.webp`}
          alt={rarity}
          className="size-5 drop-shadow-md"
        />
      </div>

      {/* Card name */}
      <span className="px-3 text-center text-sm font-semibold text-white drop-shadow-md">
        {name}
      </span>
    </div>
  );
}
