import { useDomainColors } from "@/hooks/use-domain-colors";
import { deckGlowStyle } from "@/lib/domain";

/**
 * The identity backdrop the deck hero and the archive's premier rows share: a
 * domain-tinted glow, the card art blurred behind the surface, and a
 * two-direction scrim — the side fade keeps text on the left readable, the
 * bottom fade settles the band into the card it sits on.
 *
 * Renders absolutely-positioned layers only: the caller provides the
 * `relative overflow-hidden` container and stacks its content above with
 * `relative`. With no art it still paints the glow, so a band without an image
 * keeps its domain identity instead of going flat.
 */
export function ArtBandBackdrop({
  thumbnail,
  position = 20,
  domains,
}: {
  thumbnail?: string | null;
  /** Vertical crop focus of the art, percent from the top. */
  position?: number;
  /** Domain slugs driving the glow's tint. */
  domains: readonly string[];
}) {
  const domainColors = useDomainColors();

  return (
    <>
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={deckGlowStyle(domains, domainColors)}
      />
      {thumbnail !== null && thumbnail !== undefined && thumbnail !== "" && (
        <>
          {/* scale-110 hides the blur's soft edges. */}
          <img
            src={thumbnail}
            alt=""
            aria-hidden="true"
            draggable={false}
            loading="lazy"
            style={{ objectPosition: `50% ${position}%` }}
            className="absolute inset-0 h-full w-full scale-110 object-cover opacity-25 blur-md saturate-125 dark:opacity-40"
          />
          <div className="from-card via-card/70 to-card/30 absolute inset-0 bg-linear-to-r" />
          <div className="to-card/80 absolute inset-0 bg-linear-to-b from-transparent via-transparent" />
        </>
      )}
    </>
  );
}
