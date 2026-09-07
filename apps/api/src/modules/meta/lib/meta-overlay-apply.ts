import type { MetaEventOverlayField, MetaPlayerOverlayField } from "@openrift/shared/types/enums";

/** `organizer: null` claimed means "clear it"; unclaimed means "say nothing" (needed to clear a nullable column). */
export interface OverlayPatch<TField extends string, TValues> {
  claimedFields: readonly TField[];
  values: TValues;
}

/** A field two overlays both claim takes the later one; callers must pass patches oldest first. */
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
