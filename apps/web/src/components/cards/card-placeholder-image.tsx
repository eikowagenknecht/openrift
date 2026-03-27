import type { Domain } from "@openrift/shared";
import { COLORLESS_DOMAIN } from "@openrift/shared";
import { useId } from "react";

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
  const noiseId = useId();

  return (
    <div
      className={cn("aspect-card relative overflow-hidden rounded-lg bg-neutral-800", className)}
      role="img"
      aria-label={`${name} placeholder — energy ${energy ?? "none"}, might ${might ?? "none"}, power ${power ?? "none"}`}
    >
      <svg className="pointer-events-none absolute inset-0 size-full opacity-15" aria-hidden="true">
        <filter id={noiseId}>
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.7"
            numOctaves="4"
            stitchTiles="stitch"
          />
        </filter>
        <rect width="100%" height="100%" filter={`url(#${noiseId})`} />
      </svg>
      <div className="absolute top-3.5 left-3.5 flex flex-col items-start gap-1">
        {energy !== null && (
          <div
            className="flex size-7 items-center justify-center rounded-full bg-white/70 text-lg font-extrabold text-black ring-1 ring-black/70"
            aria-label={`Energy: ${energy}`}
          >
            {energy}
          </div>
        )}
        {power !== null && power !== undefined && power > 0 && domainIconPath && (
          <div
            className="ml-0.5 flex flex-col items-center gap-1 rounded-[5px] px-0.5 py-1.5"
            style={bgStyle}
          >
            {Array.from({ length: power }, (_, index) => (
              <img key={index} src={domainIconPath} alt="" className="size-2 brightness-0 invert" />
            ))}
          </div>
        )}
      </div>

      {might !== null && might !== undefined && (
        <div
          className="text-md absolute top-4 right-4 flex h-6 items-center justify-center gap-1 bg-black/70 pr-2 pl-3 font-bold text-white"
          style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 10px 100%)" }}
          aria-label={`Might: ${might}`}
        >
          <img src="/images/might.svg" alt="" className="size-3.5" />
          {might}
        </div>
      )}

      {/* Card name bar */}
      <div className="absolute inset-x-0 top-[66%] w-full px-3 py-1.5" style={bgStyle}>
        {name.includes(",") ? (
          <span className="flex flex-col text-sm leading-none font-semibold text-white">
            <span>{name.slice(0, name.indexOf(","))}</span>
            <span className="text-[9px] uppercase">{name.slice(name.indexOf(",") + 1).trim()}</span>
          </span>
        ) : (
          <span className="text-sm font-semibold text-white">{name}</span>
        )}
      </div>
    </div>
  );
}
