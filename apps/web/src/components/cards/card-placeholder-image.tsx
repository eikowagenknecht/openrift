import type { Domain, Rarity } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import type { CSSProperties } from "react";
import { useId } from "react";

import { CardText } from "@/components/cards/card-text";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { getDomainGradientStyle, getPipBackgroundStyle, getPipGlyphTint } from "@/lib/domain";
import { getFilterIconPath, getTypeIconPaths } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { getCachedTintedIcon, TINT_BLACK, TINT_WHITE } from "@/lib/white-icon";

/** Gold tint for the card-type glyph, rendered in a black pip above the title. */
export const TYPE_ICON_COLOR = "#985920";

/** Maps the white/black keywords to their flat-tint hex; any other value is a literal color. */
const GLYPH_TINT: Record<string, string> = { white: TINT_WHITE, black: TINT_BLACK };

/**
 * A glyph icon forced to a flat color: white, black (the might shield), or an
 * arbitrary tint (the gold type icon). When `tinted` (the card designer's export
 * clone) a pre-tinted raster is used, because html2canvas-pro ignores CSS
 * filters and masks. Otherwise white/black use the cheap `brightness-0[ invert]`
 * filter and any other color masks a solid fill with the icon's alpha. See
 * ADR-023 and `@/lib/white-icon`.
 *
 * @returns The icon image, or null when there is no source.
 */
function GlyphIcon({
  src,
  className,
  tinted,
  color = "white",
}: {
  src?: string;
  className?: string;
  tinted?: boolean;
  /** "white", "black", or any CSS color string. */
  color?: string;
}) {
  if (!src) {
    return null;
  }
  const tintColor = GLYPH_TINT[color] ?? color;
  const cached = tinted ? getCachedTintedIcon(src, tintColor) : undefined;
  if (cached) {
    return <img src={cached} alt="" aria-hidden="true" className={className} />;
  }
  if (color === "white" || color === "black") {
    const filter = color === "black" ? "brightness-0" : "brightness-0 invert";
    return <img src={src} alt="" aria-hidden="true" className={cn(className, filter)} />;
  }
  // Recolor to an arbitrary tint by masking a solid fill with the icon's alpha.
  return (
    <span
      aria-hidden="true"
      className={cn(className, "inline-block")}
      style={{
        backgroundColor: color,
        maskImage: `url(${src})`,
        WebkitMaskImage: `url(${src})`,
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
}

interface CardPlaceholderImageProps {
  name: string;
  domain: Domain[];
  energy: number | null;
  might?: number | null;
  power?: number | null;
  types?: string[];
  superTypes?: string[];
  tags?: string[];
  rulesText?: string | null;
  effectText?: string | null;
  mightBonus?: number | null;
  flavorText?: string | null;
  rarity?: Rarity;
  publicCode?: string;
  artist?: string;
  /**
   * Label of the printing's promo marker, rendered as a small line below the
   * rarity icon. Callers pass only the promo marker's label — other markers
   * (judge, prerelease, …) are never surfaced on the placeholder.
   */
  promoLabel?: string;
  /**
   * Optional full-bleed background image (a data URL in the card designer).
   * When set, the placeholder's logo watermark and noise texture are hidden and
   * a legibility scrim is drawn behind the lower text region. See ADR-023.
   */
  backgroundImageUrl?: string;
  /**
   * Absolute size/position for the background image (computed by the designer
   * for cover + pan + zoom). Defaults to a plain centered cover.
   */
  backgroundImageStyle?: CSSProperties;
  /**
   * Render the white glyph icons from pre-tinted rasters instead of the CSS
   * `brightness-0 invert` filter, so they survive html2canvas export. Used by
   * the card designer's export clone. See ADR-023.
   */
  tintIcons?: boolean;
  className?: string;
}

export function CardPlaceholderImage({
  name,
  domain,
  energy,
  might,
  power,
  types,
  superTypes,
  tags,
  rulesText,
  effectText,
  mightBonus,
  flavorText,
  rarity,
  publicCode,
  artist,
  promoLabel,
  backgroundImageUrl,
  backgroundImageStyle,
  tintIcons,
  className,
}: CardPlaceholderImageProps) {
  const domainColors = useDomainColors();
  const primaryDomain = domain[0] ?? WellKnown.domain.COLORLESS;
  // Power pips show the domain rune; a multi-domain card has no single domain,
  // so it uses the generic (rainbow) rune instead.
  const runePipIcon =
    domain.length > 1
      ? "/images/glyphs/rune-rainbow.svg"
      : getFilterIconPath("domains", primaryDomain);
  // The pip rune sits on the domain background; tint it for legible contrast
  // (matches the foreground the admin domains/rarities previews use).
  const runePipColor = getPipGlyphTint(domain, domainColors);
  const typeIconPaths = getTypeIconPaths(types ?? [], superTypes ?? []);
  const typeText = types?.join(" ") ?? "";
  // Gear shows its energy cost in a diamond (a square rotated 45°) instead of
  // the circular badge every other type uses. Any Gear type in the set counts
  // (a Unit Gear has the diamond frame — ADR-037).
  const isGear = types?.includes(WellKnown.cardType.GEAR) ?? false;
  const bgStyle = getDomainGradientStyle(domain, "", domainColors);
  const noiseId = useId();

  return (
    <div
      className={cn(
        "aspect-card font-card @container relative overflow-hidden rounded-lg bg-neutral-800",
        className,
      )}
      role="img"
      aria-label={`${name} placeholder — energy ${energy ?? "none"}, might ${might ?? "none"}, power ${power ?? "none"}`}
    >
      {backgroundImageUrl && (
        <img
          src={backgroundImageUrl}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute object-cover"
          style={backgroundImageStyle ?? { top: 0, left: 0, width: "100%", height: "100%" }}
        />
      )}
      {backgroundImageUrl ? (
        // Darken the lower text region so name / rules / footer stay legible
        // over any photo. The name bar carries its own domain gradient.
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[55%] bg-linear-to-t from-black/85 via-black/55 to-transparent"
        />
      ) : (
        <>
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
          <GlyphIcon
            src="/logo.svg"
            tinted={tintIcons}
            className="pointer-events-none absolute top-[14%] left-1/2 size-[40cqw] -translate-x-1/2 opacity-15"
          />
        </>
      )}
      <div className="absolute top-[4.7%] left-[5.5%] flex flex-col items-start gap-[1cqw]">
        {energy !== null &&
          (isGear ? (
            <div
              className="relative flex size-[11.7cqw] items-center justify-center"
              aria-label={`Energy: ${energy}`}
            >
              <span
                aria-hidden="true"
                className="absolute inset-[1.7cqw] rotate-45 bg-white/70 ring-1 ring-black/70"
              />
              <span className="font-numeric relative text-[8cqw] font-semibold text-black">
                {energy}
              </span>
            </div>
          ) : (
            <div
              className="font-numeric flex size-[11.7cqw] items-center justify-center rounded-full bg-white/70 text-[8cqw] font-semibold text-black ring-1 ring-black/70"
              aria-label={`Energy: ${energy}`}
            >
              {energy}
            </div>
          ))}
        {types?.includes(WellKnown.cardType.LEGEND) &&
          domain.some((d) => d !== WellKnown.domain.COLORLESS) &&
          domain
            .filter((d) => d !== WellKnown.domain.COLORLESS)
            .map((d) => (
              <span
                key={d}
                className="flex size-[10cqw] items-center justify-center rounded-full"
                style={getDomainGradientStyle([d], "", domainColors)}
              >
                <GlyphIcon
                  src={getFilterIconPath("domains", d)}
                  tinted={tintIcons}
                  className="size-[6cqw]"
                />
              </span>
            ))}
        {power !== null && power !== undefined && power > 0 && runePipIcon && (
          <div
            className="mt-[1cqw] ml-[0cqw] flex flex-col items-center gap-[0.5cqw] rounded-[3cqw] px-[1cqw] py-[2.25cqw]"
            style={getPipBackgroundStyle(domain, domainColors)}
          >
            {Array.from({ length: power }, (_, index) => (
              <GlyphIcon
                key={index}
                src={runePipIcon}
                color={runePipColor}
                tinted={tintIcons}
                className="size-[4cqw]"
              />
            ))}
          </div>
        )}
      </div>

      {might !== null && might !== undefined && (
        <div
          className="font-numeric absolute top-[5.5%] right-[7.5%] flex h-[9cqw] items-stretch overflow-hidden text-[7cqw] font-semibold"
          style={{ clipPath: "polygon(0 0, 100% 0, 100% 100%, 13% 100%)" }}
          aria-label={`Might: ${might}`}
        >
          <div className="flex items-center justify-center bg-white/70 pr-[0.5cqw] pl-[1.7cqw]">
            <GlyphIcon
              src="/images/might.svg"
              color="black"
              tinted={tintIcons}
              className="size-[6cqw]"
            />
          </div>
          <div className="flex items-center justify-center bg-black/70 pr-[2cqw] pl-[2.3cqw] text-white">
            {might}
          </div>
        </div>
      )}

      {/* Type + Tags */}
      {(typeText || (tags && tags.length > 0)) && (
        <div className="absolute top-[55%] ml-[1.7cqw] flex -translate-y-full items-center gap-[1.5cqw] px-[3cqw] pb-[1cqw]">
          {typeIconPaths.map((path) => (
            <span
              key={path}
              className="flex h-[8cqw] w-[6cqw] translate-y-[1cqw] items-center justify-center rounded-full bg-black"
            >
              <GlyphIcon
                src={path}
                color={TYPE_ICON_COLOR}
                tinted={tintIcons}
                className="size-[4cqw]"
              />
            </span>
          ))}
          {typeText && (
            <span className="relative inline-flex translate-y-[1cqw] items-center pr-[1.5cqw] pl-[1cqw]">
              <span className="absolute inset-0 -skew-x-[15deg]" style={bgStyle} />
              <span className="font-condensed relative text-[3cqw] font-semibold tracking-tighter text-white uppercase italic">
                {superTypes && superTypes.length > 0
                  ? `${superTypes.join(" ")} ${typeText}`
                  : typeText}
              </span>
            </span>
          )}
          {tags?.map((tag) => (
            <span
              key={tag}
              className="relative inline-flex translate-y-[1cqw] items-center pr-[1.5cqw] pl-[1cqw]"
            >
              <span className="absolute inset-0 -skew-x-[15deg] bg-black/90" />
              <span className="font-condensed relative text-[3cqw] font-semibold tracking-tighter text-white uppercase italic">
                {tag}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Card name bar */}
      <div
        className="font-display absolute inset-x-0 top-[55.25%] flex h-[12cqw] w-full items-center px-[10cqw]"
        style={bgStyle}
      >
        {name.includes(",") ? (
          <span className="flex flex-col tracking-wide text-white">
            <span className="-mt-[0.5cqw] text-[5cqw] font-semibold">
              {name.slice(0, name.indexOf(","))}
            </span>
            <span className="-mt-[2cqw] text-[3cqw] uppercase italic">
              {name.slice(name.indexOf(",") + 1).trim()}
            </span>
          </span>
        ) : (
          <span className="text-[5cqw] font-semibold tracking-wide text-white">{name}</span>
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
            <p className="px-[3cqw] text-[3.5cqw] leading-[1.3] text-white/80">
              <CardText text={rulesText} interactive={false} onDark />
            </p>
          )}
          {/* Effect + Might Bonus or Flavor Text + Might Bonus */}
          {(effectText || (mightBonus !== null && mightBonus !== undefined)) && (
            <div
              className="mt-[2cqw] flex items-start gap-[2cqw] rounded-[1.5cqw] px-[3cqw] py-[1cqw]"
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
            <p className="px-[3cqw] text-[3.5cqw] leading-[1.3] text-white/50 italic">
              {flavorText}
            </p>
          )}
        </div>
      )}

      {/* Footer: rarity + meta line */}
      <div className="absolute inset-x-0 bottom-[2%] flex flex-col items-center gap-[0.5cqw] px-[5cqw]">
        {rarity && (
          <img
            src={getFilterIconPath("rarities", rarity, { size: "full" })}
            alt={rarity}
            className="size-[3cqw]"
          />
        )}
        {promoLabel && (
          <span className="font-condensed text-[2.5cqw] font-semibold tracking-wider text-white/70 uppercase">
            {promoLabel}
          </span>
        )}
        {/* Always rendered with a fixed height so the rarity icon above keeps
            its position even when code, artist, and domains are all empty. */}
        <div className="flex h-[4cqw] w-full items-center justify-between text-[2.5cqw] text-white/70">
          {publicCode && <span>{publicCode}</span>}
          <span className="ml-auto flex items-center gap-[1cqw]">
            {artist && (
              <>
                <GlyphIcon
                  src="/images/artist.svg"
                  tinted={tintIcons}
                  className="size-[2.5cqw] opacity-70"
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
                  <GlyphIcon
                    src={getFilterIconPath("domains", d)}
                    tinted={tintIcons}
                    className="size-[2.5cqw]"
                  />
                </span>
              ))}
          </span>
        </div>
      </div>
    </div>
  );
}
