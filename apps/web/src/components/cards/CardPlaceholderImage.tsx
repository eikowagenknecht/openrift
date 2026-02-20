import type { CardType, Rarity } from "@openrift/shared";

import { cn } from "@/lib/utils";

const rarityColors: Record<Rarity, string> = {
  Common: "bg-neutral-400 dark:bg-neutral-600",
  Uncommon: "bg-green-600 dark:bg-green-700",
  Rare: "bg-blue-500 dark:bg-blue-600",
  Epic: "bg-purple-500 dark:bg-purple-600",
  Overnumbered: "bg-amber-500 dark:bg-amber-600",
};

const typeIcons: Record<CardType, string> = {
  Champion: "\u2694",
  Legend: "\u2605",
  Unit: "\u2666",
  Rune: "\u25C6",
  Spell: "\u2728",
  Gear: "\u2699",
  Battlefield: "\u26EA",
};

interface CardPlaceholderImageProps {
  name: string;
  rarity: Rarity;
  type: CardType;
  className?: string;
}

export function CardPlaceholderImage({ name, rarity, type, className }: CardPlaceholderImageProps) {
  return (
    <div
      className={cn(
        "relative flex aspect-[2/3] items-center justify-center overflow-hidden rounded-lg",
        rarityColors[rarity],
        className,
      )}
    >
      <span className="absolute top-2 right-2 text-lg opacity-80">{typeIcons[type]}</span>
      <span className="px-3 text-center text-sm font-semibold text-white drop-shadow-md">
        {name}
      </span>
    </div>
  );
}
