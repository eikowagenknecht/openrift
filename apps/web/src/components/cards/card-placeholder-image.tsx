import { getDomainGradientStyle } from "@/lib/domain";
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
  domain: string[];
  energy: number | null;
  might?: number | null;
  className?: string;
}

export function CardPlaceholderImage({
  name,
  domain,
  energy,
  might,
  className,
}: CardPlaceholderImageProps) {
  const bgStyle = getDomainGradientStyle(domain);

  return (
    <div
      className={cn(
        "relative flex aspect-[744/1039] items-center justify-center overflow-hidden rounded-lg",
        className,
      )}
      style={bgStyle}
    >
      {/* Top-left: energy circle */}
      {energy !== null && energy !== undefined && (
        <div className="absolute top-2 left-2">
          <div className="flex size-8 items-center justify-center rounded-full bg-black/70 text-sm font-bold text-white">
            {energy}
          </div>
        </div>
      )}

      {/* Top-right: might */}
      {might !== null && might !== undefined && (
        <div className="absolute top-2 right-2 flex size-8 items-center justify-center gap-0.5 rounded-full bg-black/70 text-sm font-bold text-white">
          <img src="/images/might.svg" alt="Might" className="size-3.5" />
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
