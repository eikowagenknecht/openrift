import { getDomainGradientStyle } from "@/lib/domain";
import { getFilterIconPath } from "@/lib/icons";
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
  power?: number | null;
  className?: string;
}

export function CardPlaceholderImage({
  name,
  domain,
  energy,
  might,
  power,
  className,
}: CardPlaceholderImageProps) {
  const primaryDomain = domain[0] ?? "Colorless";
  const domainIconPath = getFilterIconPath("domains", primaryDomain);
  const bgStyle = getDomainGradientStyle(domain);

  return (
    <div
      className={cn(
        "relative flex aspect-card items-center justify-center overflow-hidden rounded-lg",
        className,
      )}
      style={bgStyle}
    >
      <div className="absolute top-2 left-2 flex flex-col items-start gap-1.5">
        {energy !== null && energy !== undefined && (
          <div className="flex size-8 items-center justify-center rounded-full bg-black/70 text-sm font-bold text-white">
            {energy}
          </div>
        )}
        {power !== null &&
          power !== undefined &&
          power > 0 &&
          domainIconPath &&
          Array.from({ length: power }, (_, index) => (
            <img
              key={index}
              src={domainIconPath}
              alt=""
              className="ml-1 size-5 brightness-0 invert drop-shadow-md"
            />
          ))}
      </div>

      {might !== null && might !== undefined && (
        <div className="absolute top-2 right-2 flex h-8 items-center justify-center gap-0.5 rounded-md bg-black/70 px-2 text-sm font-bold text-white">
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
