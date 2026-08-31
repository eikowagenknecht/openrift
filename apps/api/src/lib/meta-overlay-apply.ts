import type { MetaEventOverlayField, MetaPlayerOverlayField } from "@openrift/shared/types";

/**
 * Folding accepted overlays onto promoted values (ADR-014 revision 3).
 *
 * Pure, so the precedence rule is testable without a database: promotion runs
 * first, then each accepted overlay in acceptance order, and an overlay only
 * touches the fields it claims. Everything else falls through.
 *
 * Claiming is the whole point of the mask. `organizer: null` claimed means
 * "clear it"; unclaimed means "say nothing", and without the distinction every
 * nullable column would be unclearable.
 */

/** One overlay, reduced to what applying needs. */
export interface OverlayPatch<TField extends string, TValues> {
  claimedFields: readonly TField[];
  values: TValues;
}

/**
 * Applies each patch's claimed fields over `base`, in the order given.
 *
 * A field two overlays both claim takes the later one, which is why callers
 * pass them oldest first: the most recent correction wins.
 */
export function applyOverlays<TField extends string, TValues extends Record<string, unknown>>(
  base: TValues,
  patches: readonly OverlayPatch<TField, Partial<TValues>>[],
): TValues {
  let result = base;
  for (const patch of patches) {
    for (const field of patch.claimedFields) {
      if (!Object.hasOwn(patch.values, field)) {
        continue;
      }
      result = { ...result, [field]: patch.values[field as keyof TValues] };
    }
  }
  return result;
}

/**
 * The fields any accepted overlay claims, which is what the drift view needs to
 * grey out: a field under an overlay is no longer the source's to win.
 */
export function claimedFieldSet<TField extends string>(
  patches: readonly OverlayPatch<TField, unknown>[],
): Set<TField> {
  const claimed = new Set<TField>();
  for (const patch of patches) {
    for (const field of patch.claimedFields) {
      claimed.add(field);
    }
  }
  return claimed;
}

export type MetaEventOverlayPatch<TValues> = OverlayPatch<MetaEventOverlayField, TValues>;
export type MetaPlayerOverlayPatch<TValues> = OverlayPatch<MetaPlayerOverlayField, TValues>;
