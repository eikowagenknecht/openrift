import type { Domain } from "@openrift/shared";
import { COLORLESS_DOMAIN } from "@openrift/shared";

import { getDomainGradientStyle } from "@/lib/domain";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface CardPlaceholderImageProps {
  name: string;
  domain: Domain[];
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
  const primaryDomain = domain[0] ?? COLORLESS_DOMAIN;
  const domainIconPath = getFilterIconPath("domains", primaryDomain);
  const bgStyle = getDomainGradientStyle(domain);

  return (
    <div
      className={cn("aspect-card flex items-center overflow-hidden rounded-lg", className)}
      style={bgStyle}
      role="img"
      aria-label={`${name} placeholder — energy ${energy ?? "none"}, might ${might ?? "none"}, power ${power ?? "none"}`}
    >
      <div className="absolute top-2 left-2 flex flex-col items-start gap-1.5">
        {energy !== null && (
          <div
            className="flex size-8 items-center justify-center rounded-full bg-black/70 text-sm font-bold text-white"
            aria-label={`Energy: ${energy}`}
          >
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
              className="ml-1 size-5 brightness-0 drop-shadow-md invert"
            />
          ))}
      </div>

      {might !== null && might !== undefined && (
        <div
          className="absolute top-2 right-2 flex h-8 items-center justify-center gap-0.5 rounded-md bg-black/70 px-2 text-sm font-bold text-white"
          aria-label={`Might: ${might}`}
        >
          <img src="/images/might.svg" alt="" className="size-3.5" />
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
