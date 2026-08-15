/**
 * Narrowing for dnd-kit drag and drop payloads.
 *
 * Every surface keeps its own payload vocabulary — a deck drag carries zones, a
 * collection drag carries copy ids, a tier drag carries rows, and there is no
 * useful shape common to all three. What they do share is the check at the
 * boundary: `event.active.data.current` is `unknown`, and dnd-kit will happily
 * hand a handler a payload another context on the page put there.
 */

/** The minimum any of our payloads carries: a discriminator to check it by. */
interface TypedDragData {
  type: string;
}

/**
 * Narrows a dnd-kit payload to one of `types`, or nothing.
 *
 * Prefer this to a bare `as` cast. Contexts nest (the collections layout hosts
 * the sidebar's own sortable rows; the deck editor hosts the card browser), so
 * a handler does get payloads that are not its own, and a cast would let one
 * through to be read as a shape it never had.
 *
 * @returns The payload when it is one of `types`, otherwise undefined.
 */
export function asDragData<T extends TypedDragData>(
  data: unknown,
  types: readonly T["type"][],
): T | undefined {
  if (typeof data !== "object" || data === null) {
    return undefined;
  }
  const candidate = data as T;
  return types.includes(candidate.type) ? candidate : undefined;
}
