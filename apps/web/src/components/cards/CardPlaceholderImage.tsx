import { cn } from "@/lib/utils";

export const DOMAIN_COLORS: Record<string, string> = {
  Fury: "#CB212D",
  Calm: "#16AA71",
  Mind: "#227799",
  Body: "#E2710C",
  Chaos: "#6B4891",
  Order: "#CDA902",
  Colorless: "#737373",
};

interface CardPlaceholderImageProps {
  name: string;
  domain: string;
  cost: number;
  might?: number;
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
  domain,
  cost,
  might,
  className,
}: CardPlaceholderImageProps) {
  const bgStyle = getDomainBackground(domain);

  return (
    <div
      className={cn(
        "relative flex aspect-[2/3] items-center justify-center overflow-hidden rounded-lg",
        className,
      )}
      style={bgStyle}
    >
      {/* Top-left: cost circle */}
      <div className="absolute top-2 left-2">
        <div className="flex size-8 items-center justify-center rounded-full bg-black/70 text-sm font-bold text-white">
          {cost}
        </div>
      </div>

      {/* Top-right: might */}
      {might !== undefined && might > 0 && (
        <div className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-full bg-black/70 text-sm font-bold text-white">
          {might}
        </div>
      )}

      {/* Card name */}
      <span className="px-3 text-center text-sm font-semibold text-white drop-shadow-md">
        {name}
      </span>
    </div>
  );
}
