import type { CardType, Rarity } from "@openrift/shared";

import { cn } from "@/lib/utils";

export const DOMAIN_COLORS: Record<string, string> = {
  Fury: "#CB212D",
  Calm: "#16AA71",
  Mind: "#227799",
  Body: "#E2710C",
  Chaos: "#6B4891",
  Order: "#CDA902",
};

interface CardPlaceholderImageProps {
  name: string;
  rarity: Rarity;
  type: CardType;
  domain: string;
  cost: number;
  attack?: number | null;
  setNumber?: string;
  className?: string;
}

function getDomainBackground(domain: string): React.CSSProperties {
  const domains = domain.split("/");
  if (domains.length === 1) {
    return { backgroundColor: DOMAIN_COLORS[domains[0]] ?? "#737373" };
  }
  const color1 = DOMAIN_COLORS[domains[0]] ?? "#737373";
  const color2 = DOMAIN_COLORS[domains[1]] ?? "#737373";
  return {
    background: `linear-gradient(135deg, ${color1} 50%, ${color2} 50%)`,
  };
}

export function CardPlaceholderImage({
  name,
  rarity,
  type,
  domain,
  cost,
  attack,
  setNumber,
  className,
}: CardPlaceholderImageProps) {
  const bgStyle = getDomainBackground(domain);
  const domains = domain.split("/");

  return (
    <div
      className={cn(
        "relative flex aspect-[2/3] items-center justify-center overflow-hidden rounded-lg",
        className,
      )}
      style={bgStyle}
    >
      {/* Top-left: cost circle + domain icon(s) below */}
      <div className="absolute top-2 left-2 flex flex-col items-center gap-1">
        <div className="flex size-8 items-center justify-center rounded-full bg-black/70 text-sm font-bold text-white">
          {cost}
        </div>
        <div className="flex items-center gap-0.5">
          {domains.map((d) => (
            <img
              key={d}
              src={`/icons/domains/${d}.webp`}
              alt={d}
              className="size-6 drop-shadow-md"
            />
          ))}
        </div>
      </div>

      {/* Top-right: strength (attack) */}
      {attack !== undefined && attack !== null && (
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

      {/* Bottom-right: set number */}
      {setNumber && (
        <span className="absolute bottom-2 right-2 text-xs font-medium text-white/80 drop-shadow-md">
          {setNumber}
        </span>
      )}

      {/* Card name */}
      <span className="px-3 text-center text-sm font-semibold text-white drop-shadow-md">
        {name}
      </span>
    </div>
  );
}
