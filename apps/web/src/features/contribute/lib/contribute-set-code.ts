export interface SetOption {
  slug: string;
  name: string;
}

/** The set slug a printed code encodes: the segment before the first hyphen, or the whole code. */
export function setSlugFromPublicCode(publicCode?: string | null): string | null {
  const trimmed = publicCode?.trim();
  if (!trimmed) {
    return null;
  }

  const prefix = trimmed.split("-")[0];
  if (!prefix) {
    return null;
  }

  return prefix.toUpperCase();
}

/** null when the code encodes a slug that matches no known set. */
export function resolveSetFromPublicCode(
  publicCode: string | null | undefined,
  sets: readonly SetOption[],
): SetOption | null {
  const slug = setSlugFromPublicCode(publicCode);
  if (!slug) {
    return null;
  }

  return sets.find((set) => set.slug.toUpperCase() === slug) ?? null;
}
