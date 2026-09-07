import { useDomainColors } from "@/hooks/use-domain-colors";
import { deckGlowStyle } from "@/lib/domain";

/**
 * Renders absolutely-positioned layers only; the caller provides the
 * `relative overflow-hidden` container and stacks content above with `relative`.
 */
export function ArtBandBackdrop({
  thumbnail,
  position = 20,
  domains,
}: {
  thumbnail?: string | null;
  /** Vertical crop focus of the art, percent from the top. */
  position?: number;
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
