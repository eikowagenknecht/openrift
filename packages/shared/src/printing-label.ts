import { WellKnown } from "./well-known.js";

/**
 * The printing fields a variant label is derived from. Structural on purpose:
 * both the web's full `Printing` and the compact catalog wire shape the Discord
 * bot holds satisfy it, so every surface labels a printing the same way.
 */
export interface VariantLabelPrinting {
  language: string;
  artVariant: string;
  finish: string;
  size: string;
  isSigned: boolean;
  markers: readonly { slug: string; label: string }[];
}

/** Slug → display label maps for the enum groups a variant label names. */
export interface VariantLabelEnumLabels {
  artVariants: Record<string, string>;
  finishes: Record<string, string>;
  cardSizes: Record<string, string>;
}

/**
 * A printing's distinguishing attributes split so the language can render as a
 * chip instead of a `[XX]` tag. `language` is the code to show (or null when it
 * shouldn't be shown — English, or when all siblings share it); `rest` holds the
 * non-language attribute labels (art variant, finish, size, signed, markers).
 */
export interface PrintingVariantLabelParts {
  language: string | null;
  rest: string[];
}

/**
 * Splits a printing's distinguishing attributes into the language code and the
 * remaining attribute labels. The rules match
 * {@link formatPrintingVariantLabel}: a language is shown only when siblings
 * differ in language; a non-normal art variant and oversized are always
 * labeled; finish / signed / markers are omitted when shared by all siblings.
 * @returns The language code (or null) and the ordered non-language labels.
 */
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
    rest.push(labels.artVariants[printing.artVariant]);
  }
  if (printing.finish !== WellKnown.finish.NORMAL && !allSame((c) => c.finish)) {
    rest.push(labels.finishes[printing.finish]);
  }
  // Oversized is always labeled when present (like art variant): the larger
  // print carries meaning even without a standard counterpart in the list.
  if (printing.size !== WellKnown.cardSize.STANDARD) {
    rest.push(labels.cardSizes[printing.size]);
  }
  if (printing.isSigned && !allSame((c) => c.isSigned)) {
    rest.push("Signed");
  }
  if (printing.markers.length > 0 && !allSame((c) => c.markers.map((m) => m.slug).join("+"))) {
    rest.push(printing.markers.map((m) => m.label).join(" + "));
  }
  return { language, rest };
}

/**
 * Human-readable label for a printing's distinguishing attributes.
 * Omits "Normal" defaults. Most attributes are also omitted when shared by all
 * siblings, but a non-normal art variant is always labeled — the alt-art status
 * carries meaning even without a normal counterpart in the list. When language
 * varies among siblings, every row gets a `[XX]` tag (including English) so the
 * pairing reads symmetrically rather than leaving default rows blank.
 *
 * String form for value/search/aria uses; in the web app prefer the
 * `PrintingVariantLabel` component, which renders the language as a chip.
 * @returns A label like "[EN] · Alt Art", or "Standard" when no distinguishing attributes.
 */
export function formatPrintingVariantLabel(
  printing: VariantLabelPrinting,
  siblings: readonly VariantLabelPrinting[] | undefined,
  labels: VariantLabelEnumLabels,
): string {
  const { language, rest } = formatPrintingVariantLabelParts(printing, siblings, labels);
  const parts = language ? [`[${language}]`, ...rest] : rest;
  return parts.length > 0 ? parts.join(" · ") : "Standard";
}
