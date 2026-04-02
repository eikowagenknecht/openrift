import type { Domain } from "@openrift/shared";
import { COLORLESS_DOMAIN } from "@openrift/shared";
import { useId } from "react";

import { CardText } from "@/components/cards/card-text";
import { getDomainGradientStyle } from "@/lib/domain";
import { getFilterIconPath } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface CardPlaceholderImageProps {
  name: string;
  domain: Domain[];
  energy: number | null;
  might?: number | null;
  power?: number | null;
  type?: string;
  superTypes?: string[];
  tags?: string[];
  rulesText?: string | null;
  effectText?: string | null;
  mightBonus?: number | null;
  flavorText?: string | null;
  className?: string;
  variant?: "dark" | "light"; // custom: light variant for proxy printing (white bg, dark text, no noise)
}

export function CardPlaceholderImage({
  name,
  domain,
  energy,
  might,
  power,
  type,
  superTypes,
  tags,
  rulesText,
  effectText,
  mightBonus,
  flavorText,
  className,
  variant = "dark",
}: CardPlaceholderImageProps) {
  const primaryDomain = domain[0] ?? COLORLESS_DOMAIN;
  const domainIconPath = getFilterIconPath("domains", primaryDomain);
  const bgStyle = getDomainGradientStyle(domain);
  const noiseId = useId();
  const isLight = variant === "light"; // custom: light variant for proxy printing

  return (
    <div
      className={cn(
        "aspect-card @container relative overflow-hidden rounded-lg",
        isLight ? "border border-neutral-300 bg-white" : "bg-neutral-800", // custom: light variant uses white background with border
        className,
      )}
      role="img"
      aria-label={`${name} placeholder — energy ${energy ?? "none"}, might ${might ?? "none"}, power ${power ?? "none"}`}
    >
      {/* custom: noise overlay hidden in light variant for proxy printing */}
      {!isLight && (
        <svg
          className="pointer-events-none absolute inset-0 size-full opacity-15"
          aria-hidden="true"
        >
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
      )}
      <div className="absolute top-[4%] left-[6%] flex flex-col items-start gap-[1cqw]">
        {energy !== null && (
          <div
            className={cn(
              "flex size-[13cqw] items-center justify-center rounded-full text-[8cqw] font-extrabold ring-1",
              isLight
                ? "bg-neutral-100 text-black ring-neutral-400" // custom: light variant
                : "bg-white/70 text-black ring-black/70",
            )}
            aria-label={`Energy: ${energy}`}
          >
            {energy}
          </div>
        )}
        {power !== null && power !== undefined && power > 0 && domainIconPath && (
          <div
            className="ml-[1cqw] flex flex-col items-center gap-[2.5cqw] rounded-[3cqw] px-[1cqw] py-[2.25cqw]"
            style={bgStyle}
          >
            {Array.from({ length: power }, (_, index) => (
              <img
                key={index}
                src={domainIconPath}
                alt=""
                className={cn("size-[3.5cqw]", !isLight && "brightness-0 invert")} // custom: dark mode inverts domain icons to white
              />
            ))}
          </div>
        )}
      </div>

      {might !== null && might !== undefined && (
        <div
          className={cn(
            "absolute top-[4%] right-[6%] flex h-[11cqw] items-center justify-center gap-[2cqw] pr-[3cqw] pl-[4cqw] text-[7cqw] font-extrabold",
            isLight
              ? "bg-neutral-200 text-black" // custom: light variant
              : "bg-black/70 text-white",
          )}
          style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 12% 100%)" }}
          aria-label={`Might: ${might}`}
        >
          <img src="/images/might.svg" alt="" className="size-[5cqw]" />
          {/* custom: dark icon in light variant */}
          {might}
        </div>
      )}

      {/* Type + Tags */}
      {(type || (tags && tags.length > 0)) && (
        <div className="absolute top-[55%] flex -translate-y-full items-end gap-[1.5cqw] px-[8cqw] pb-[1cqw]">
          {type && (
            <span className="relative inline-flex items-center pr-[1.5cqw] pl-[1cqw]">
              <span className="absolute inset-0 -skew-x-[15deg]" style={bgStyle} />
              <span className="font-condensed relative text-[3cqw] font-semibold text-white uppercase italic">
                {superTypes && superTypes.length > 0 ? `${superTypes.join(" ")} ${type}` : type}
              </span>
            </span>
          )}
          {tags?.map((tag) => (
            <span key={tag} className="relative inline-flex items-center pr-[1.5cqw] pl-[1cqw]">
              <span
                className={cn(
                  "absolute inset-0 -skew-x-[15deg]",
                  isLight ? "bg-neutral-300" : "bg-black/90",
                )}
              />
              {/* custom: light variant for tag bg + text */}
              <span
                className={cn(
                  "font-condensed relative text-[3cqw] font-semibold uppercase italic",
                  isLight ? "text-black" : "text-white",
                )}
              >
                {tag}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Card name bar */}
      <div
        className="absolute inset-x-0 top-[55%] flex h-[12cqw] w-full items-center px-[10cqw]"
        style={bgStyle}
      >
        {name.includes(",") ? (
          <span className="flex flex-col tracking-wide text-white">
            <span className="-mt-[0.5cqw] text-[5cqw] font-extrabold">
              {name.slice(0, name.indexOf(","))}
            </span>
            <span className="-mt-[2cqw] text-[3cqw] uppercase italic">
              {name.slice(name.indexOf(",") + 1).trim()}
            </span>
          </span>
        ) : (
          <span className="text-[5cqw] font-extrabold tracking-wide text-white">{name}</span>
        )}
      </div>

      {/* Card text */}
      {(rulesText || effectText || flavorText) && (
        <div className="card-text-scaled absolute inset-x-0 top-[67%] flex flex-col gap-[1.5cqw] px-[8cqw]">
          {/* Rules — custom: light variant swaps text color */}
          {rulesText && (
            <p
              className={cn(
                "px-[2cqw] text-[3.5cqw] leading-[1.3]",
                isLight ? "text-black/80" : "text-white/80",
              )}
            >
              <CardText text={rulesText} />
            </p>
          )}
          {/* Effect + Might Bonus or Flavor Text + Might Bonus */}
          {(effectText || (mightBonus !== null && mightBonus !== undefined)) && (
            <div
              className="mt-[2cqw] flex items-start gap-[2cqw] rounded-[1.5cqw] px-[2cqw] py-[1cqw]"
              style={getDomainGradientStyle(domain, isLight ? "20" : "30")}
            >
              {/* custom: lighter tint in light variant */}
              <div className="flex-1">
                {effectText ? (
                  <p
                    className={cn(
                      "text-[3.5cqw] leading-[1.3]",
                      isLight ? "text-black/80" : "text-white/80",
                    )}
                  >
                    {/* custom: light variant text color */}
                    <CardText text={effectText} />
                  </p>
                ) : (
                  flavorText && (
                    <p
                      className={cn(
                        "text-[3.5cqw] leading-[1.3] italic",
                        isLight ? "text-black/50" : "text-white/50",
                      )}
                    >
                      {/* custom: light variant text color */}
                      {flavorText}
                    </p>
                  )
                )}
              </div>
              {mightBonus !== null && mightBonus !== undefined && mightBonus > 0 && (
                <div className="flex shrink-0 items-center gap-[0.5cqw]">
                  {/* custom: dark icon + text in light variant */}
                  <img src="/images/might.svg" alt="" className="size-[3.5cqw]" />
                  <span
                    className={cn("text-[3.5cqw] font-bold", isLight ? "text-black" : "text-white")}
                  >
                    +{mightBonus}
                  </span>
                </div>
              )}
            </div>
          )}
          {/* Flavor Text — custom: light variant swaps text color */}
          {(effectText || mightBonus === null || mightBonus === undefined) && flavorText && (
            <p
              className={cn(
                "px-[2cqw] text-[3.5cqw] leading-[1.3] italic",
                isLight ? "text-black/50" : "text-white/50",
              )}
            >
              {flavorText}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
