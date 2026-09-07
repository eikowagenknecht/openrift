import { enumLabel } from "./enum-label.js";
import { WellKnown } from "./well-known.js";

/** Structural on purpose: both the web `Printing` and the Discord bot's compact wire shape satisfy it. */
export interface VariantLabelPrinting {
  language: string;
  artVariant: string;
  finish: string;
  size: string;
  isSigned: boolean;
  isOvernumbered: boolean;
  markers: readonly { slug: string; label: string }[];
}

export interface VariantLabelEnumLabels {
  artVariants: Record<string, string>;
  finishes: Record<string, string>;
  cardSizes: Record<string, string>;
}

export interface PrintingVariantLabelParts {
  language: string | null;
  rest: string[];
}

export function formatPrintingVariantLabelParts(
  printing: VariantLabelPrinting,
  siblings: readonly VariantLabelPrinting[] | undefined,
  labels: VariantLabelEnumLabels,
): PrintingVariantLabelParts {
  const allSame = (fn: (c: VariantLabelPrinting) => unknown) =>
    siblings ? siblings.every((s) => fn(s) === fn(printing)) : false;

  const language = siblings && !allSame((c) => c.language) ? printing.language : null;
  const rest: string[] = [];
  if (printing.artVariant !== WellKnown.artVariant.NORMAL) {
    rest.push(enumLabel(labels.artVariants, printing.artVariant));
  }
  if (printing.isOvernumbered) {
    rest.push("Overnumbered");
  }
  if (printing.finish !== WellKnown.finish.NORMAL && !allSame((c) => c.finish)) {
    rest.push(enumLabel(labels.finishes, printing.finish));
  }
  // Oversized is always labeled, unlike finish/signed/markers: no allSame() check.
  if (printing.size !== WellKnown.cardSize.STANDARD) {
    rest.push(enumLabel(labels.cardSizes, printing.size));
  }
  if (printing.isSigned && !allSame((c) => c.isSigned)) {
    rest.push("Signed");
  }
  if (printing.markers.length > 0 && !allSame((c) => c.markers.map((m) => m.slug).join("+"))) {
    rest.push(printing.markers.map((m) => m.label).join(" + "));
  }
  return { language, rest };
}

export function formatPrintingVariantLabel(
  printing: VariantLabelPrinting,
  siblings: readonly VariantLabelPrinting[] | undefined,
  labels: VariantLabelEnumLabels,
): string {
  const { language, rest } = formatPrintingVariantLabelParts(printing, siblings, labels);
  const parts = language ? [`[${language}]`, ...rest] : rest;
  return parts.length > 0 ? parts.join(" · ") : "Standard";
}
