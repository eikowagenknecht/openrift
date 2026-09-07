import type { Printing } from "@openrift/shared";
import { WellKnown, enumLabel } from "@openrift/shared";
import { GlobeIcon, ImagesIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useEnumOrders } from "@/hooks/use-enums";

const PILL_CLASS =
  "bg-background/85 text-foreground/90 flex items-center gap-[1.5cqi] rounded-[2cqi] px-[3cqi] py-[1.5cqi] text-[5.5cqi] font-medium shadow-md";

export function FallbackArtBadges({
  printing,
  artPrinting,
}: {
  printing: Printing;
  artPrinting: Printing | null;
}) {
  const { labels } = useEnumOrders();
  const badges: ReactNode[] = [];
  if (artPrinting === null) {
    badges.push(
      <span key="substitute" className={PILL_CLASS}>
        <ImagesIcon aria-hidden="true" className="size-[6cqi]" />
        Substitute art
      </span>,
    );
  } else if (printing.language !== artPrinting.language) {
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
        {enumLabel(labels.artVariants, artVariant)}
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
        {enumLabel(labels.finishes, printing.finish)}
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
