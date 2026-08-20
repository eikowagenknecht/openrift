/**
 * Adapts an in-progress /contribute printing to the shape the app's shared
 * printing labeller reads, so the form names a printing exactly the way the
 * card detail panel does: "[EN] · Foil · Promo", with every attribute the
 * siblings agree on left out.
 *
 * The form's own fields are all nullable (a contributor hasn't necessarily said
 * anything yet) while the labeller expects the catalog's resolved values, so
 * an unanswered field becomes the default the catalog would have stored.
 */
import type { VariantLabelPrinting } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";

import type { ContributeFormPrinting } from "@/lib/contribute-json";

/**
 * Converts one form printing into the labeller's structural shape.
 * @param printing The form printing.
 * @param markerLabels Slug → label map from `useMarkerList`.
 * @returns The printing as the shared variant labeller expects it.
 */
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
    markers: printing.markerSlugs.map((slug) => ({ slug, label: markerLabels[slug] })),
  };
}

/**
 * Whether a printing is still blank, so the row can say "New printing" instead
 * of the labeller's "Standard" fallback, which would claim the contributor had
 * described a plain printing when they have described nothing at all.
 * @param printing The form printing.
 * @returns Whether the contributor has entered nothing identifying yet.
 */
export function isBlankPrinting(printing: ContributeFormPrinting): boolean {
  return (
    printing.publicCode === null &&
    printing.setId === null &&
    printing.markerSlugs.length === 0 &&
    !printing.isSigned
  );
}
