import type { VariantLabelPrinting } from "@openrift/shared";
import { enumLabel, WellKnown } from "@openrift/shared";

import type { ContributeFormPrinting } from "@/lib/contribute-json";

export function toVariantLabelPrinting(
  printing: ContributeFormPrinting,
  markerLabels: Record<string, string>,
): VariantLabelPrinting {
  return {
    language: printing.language ?? "EN",
    artVariant: printing.artVariant ?? WellKnown.artVariant.NORMAL,
    finish: printing.finish ?? WellKnown.finish.NORMAL,
    size: printing.size ?? WellKnown.cardSize.STANDARD,
    isSigned: printing.isSigned,
    isOvernumbered: printing.isOvernumbered,
    markers: printing.markerSlugs.map((slug) => ({
      slug,
      label: enumLabel(markerLabels, slug),
    })),
  };
}

export function isBlankPrinting(printing: ContributeFormPrinting): boolean {
  return (
    printing.publicCode === null &&
    printing.setId === null &&
    printing.markerSlugs.length === 0 &&
    !printing.isSigned
  );
}
