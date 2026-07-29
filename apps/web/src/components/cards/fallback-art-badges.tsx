import type { Printing } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { GlobeIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useEnumOrders } from "@/hooks/use-enums";

const PILL_CLASS =
  "bg-background/85 text-foreground/90 flex items-center gap-[1.5cqi] rounded-[2cqi] px-[3cqi] py-[1.5cqi] text-[5.5cqi] font-medium shadow-md";

/**
 * Bottom-centered badge row over substitute artwork: one badge per property
 * the real variant has that the shown art doesn't. The art's language when it
 * differs, each marker (e.g. "Promo"), a non-normal art variant, a signature,
 * and a metal finish. The "what is this / what can I do" message lives in
 * `SuggestImageNotice`; this row only enumerates the differences. Sized in
 * container-query units so it scales with the card.
 *
 * @returns The badge row overlay, or null when nothing differs; the parent
 * must be `relative`.
 */
export function FallbackArtBadges({
  printing,
  artPrinting,
}: {
  /** The printing being displayed (the one without an image). */
  printing: Printing;
  /** The standard printing whose artwork is shown instead. */
  artPrinting: Printing;
}) {
  const { labels } = useEnumOrders();
  const badges: ReactNode[] = [];
  if (printing.language !== artPrinting.language) {
    badges.push(
      <span key="language" className={PILL_CLASS}>
        <GlobeIcon aria-hidden="true" className="size-[6cqi]" />
        {artPrinting.language}
      </span>,
    );
  }
  for (const marker of printing.markers) {
    badges.push(
      <span key={`marker-${marker.slug}`} className={PILL_CLASS}>
        {marker.label}
      </span>,
    );
  }
  const artVariant = printing.artVariant || WellKnown.artVariant.NORMAL;
  if (artVariant !== WellKnown.artVariant.NORMAL) {
    badges.push(
      <span key="art-variant" className={PILL_CLASS}>
        {labels.artVariants[artVariant]}
      </span>,
    );
  }
  if (printing.isSigned) {
    badges.push(
      <span key="signed" className={PILL_CLASS}>
        Signed
      </span>,
    );
  }
  if (
    printing.finish === WellKnown.finish.METAL ||
    printing.finish === WellKnown.finish.METAL_DELUXE
  ) {
    badges.push(
      <span key="finish" className={PILL_CLASS}>
        {labels.finishes[printing.finish]}
      </span>,
    );
  }
  if (badges.length === 0) {
    return null;
  }
  return (
    <div className="@container pointer-events-none absolute inset-0 z-10">
      <div className="absolute inset-x-[2.5cqi] bottom-[2.5cqi] flex flex-wrap items-center justify-center gap-[1.5cqi]">
        {badges}
      </div>
    </div>
  );
}
