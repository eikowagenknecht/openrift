import type { Domain, Rarity } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { useId } from "react";

import { CardText } from "@/components/cards/card-text";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { getDomainGradientStyle } from "@/lib/domain";
import { getFilterIconPath, getTypeIconPath } from "@/lib/icons";
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
  rarity: Rarity;
  publicCode?: string;
  artist?: string;
  className?: string;
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
  rarity,
  publicCode,
  artist,
  className,
}: CardPlaceholderImageProps) {
  const domainColors = useDomainColors();
  const primaryDomain = domain[0] ?? WellKnown.domain.COLORLESS;
  const domainIconPath = getFilterIconPath("domains", primaryDomain);
  const typeIconPath = type ? getTypeIconPath(type, superTypes ?? []) : undefined;
  const bgStyle = getDomainGradientStyle(domain, "", domainColors);
  const noiseId = useId();

  return (
    <div
      className={cn(
        "aspect-card @container relative overflow-hidden rounded-lg bg-neutral-800",
        className,
      )}
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
      <img
        src="/logo.svg"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute top-[14%] left-1/2 size-[40cqw] -translate-x-1/2 opacity-15 brightness-0 invert"
      />
      <div className="absolute top-[4%] left-[6%] flex flex-col items-start gap-[1cqw]">
        {energy !== null && (
          <div
            className="flex size-[13cqw] items-center justify-center rounded-full bg-white/70 text-[8cqw] font-extrabold text-black ring-1 ring-black/70"
            aria-label={`Energy: ${energy}`}
          >
            {energy}
          </div>
        )}
        {type === "Legend" &&
          domain.some((d) => d !== WellKnown.domain.COLORLESS) &&
          domain
            .filter((d) => d !== WellKnown.domain.COLORLESS)
            .map((d) => (
              <span
                key={d}
                className="flex size-[10cqw] items-center justify-center rounded-full"
                style={getDomainGradientStyle([d], "", domainColors)}
              >
                <img
                  src={getFilterIconPath("domains", d)}
                  alt=""
                  className="size-[6cqw] brightness-0 invert"
                />
              </span>
            ))}
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
                className="size-[3.5cqw] brightness-0 invert"
              />
            ))}
          </div>
        )}
      </div>

      {might !== null && might !== undefined && (
        <div
          className="absolute top-[4%] right-[6%] flex h-[11cqw] items-center justify-center gap-[2cqw] bg-black/70 pr-[3cqw] pl-[4cqw] text-[7cqw] font-extrabold text-white"
          style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 12% 100%)" }}
          aria-label={`Might: ${might}`}
        >
          <img src="/images/might.svg" alt="" className="size-[5cqw]" />
          {might}
        </div>
      )}

      {/* Type + Tags */}
      {(type || (tags && tags.length > 0)) && (
        <div className="absolute top-[55%] flex -translate-y-full items-center gap-[1.5cqw] px-[3cqw] pb-[1cqw]">
          {typeIconPath && (
            <img src={typeIconPath} alt="" className="size-[4cqw] brightness-0 invert" />
          )}
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
              <span className="absolute inset-0 -skew-x-[15deg] bg-black/90" />
              <span className="font-condensed relative text-[3cqw] font-semibold text-white uppercase italic">
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

      {/* Card text — keywords must be non-interactive here: CardThumbnail wraps
          the placeholder in a <button>, and HTML5 forbids nested buttons.
          Firefox's parser auto-closes the outer button mid-tree, which punts
          the rest of the thumbnail out of its grid cell and below the footer. */}
      {(rulesText ||
        effectText ||
        flavorText ||
        (mightBonus !== null && mightBonus !== undefined && mightBonus > 0)) && (
        <div className="card-text-scaled absolute inset-x-0 top-[67%] flex flex-col gap-[1.5cqw] px-[8cqw]">
          {/* Rules */}
          {rulesText && (
            <p className="px-[2cqw] text-[3.5cqw] leading-[1.3] text-white/80">
              <CardText text={rulesText} interactive={false} onDark />
            </p>
          )}
          {/* Effect + Might Bonus or Flavor Text + Might Bonus */}
          {(effectText || (mightBonus !== null && mightBonus !== undefined)) && (
            <div
              className="mt-[2cqw] flex items-start gap-[2cqw] rounded-[1.5cqw] px-[2cqw] py-[1cqw]"
              style={getDomainGradientStyle(domain, "30", domainColors)}
            >
              <div className="flex-1">
                {effectText ? (
                  <p className="text-[3.5cqw] leading-[1.3] text-white/80">
                    <CardText text={effectText} interactive={false} onDark />
                  </p>
                ) : (
                  flavorText && (
                    <p className="text-[3.5cqw] leading-[1.3] text-white/50 italic">{flavorText}</p>
                  )
                )}
              </div>
              {mightBonus !== null && mightBonus !== undefined && mightBonus > 0 && (
                <div className="flex shrink-0 items-center gap-[0.5cqw]">
                  <img src="/images/might.svg" alt="" className="size-[3.5cqw]" />
                  <span className="text-[3.5cqw] font-bold text-white">+{mightBonus}</span>
                </div>
              )}
            </div>
          )}
          {/* Flavor Text */}
          {(effectText || mightBonus === null || mightBonus === undefined) && flavorText && (
            <p className="px-[2cqw] text-[3.5cqw] leading-[1.3] text-white/50 italic">
              {flavorText}
            </p>
          )}
        </div>
      )}

      {/* Footer: rarity + meta line */}
      <div className="absolute inset-x-0 bottom-[2%] flex flex-col items-center gap-[0.5cqw] px-[4cqw]">
        <img
          src={`/images/rarities/${rarity.toLowerCase()}.webp`}
          alt={rarity}
          className="size-[3cqw]"
        />
        {(publicCode || artist) && (
          <div className="flex w-full items-center justify-between text-[2.5cqw] text-white/70">
            {publicCode && <span>{publicCode}</span>}
            <span className="flex items-center gap-[1cqw]">
              {artist && (
                <>
                  <img
                    src="/images/artist.svg"
                    alt=""
                    className="size-[2.5cqw] opacity-70 brightness-0 invert"
                  />
                  <span>{artist}</span>
                </>
              )}
              {domain
                .filter((d) => d !== WellKnown.domain.COLORLESS)
                .map((d) => (
                  <span
                    key={d}
                    className="flex size-[4cqw] items-center justify-center rounded-full"
                    style={getDomainGradientStyle([d], "", domainColors)}
                  >
                    <img
                      src={getFilterIconPath("domains", d)}
                      alt=""
                      className="size-[2.5cqw] brightness-0 invert"
                    />
                  </span>
                ))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
