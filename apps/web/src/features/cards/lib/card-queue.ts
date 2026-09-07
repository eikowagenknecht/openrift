/** Clamped at both ends, so the last card's "down" button is a no-op. */
export function moveQueueEntry(ids: readonly string[], from: number, delta: number): string[] {
  const to = from + delta;
  if (from < 0 || from >= ids.length || to < 0 || to >= ids.length) {
    return [...ids];
  }
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) {
    return [...ids];
  }
  next.splice(to, 0, moved);
  return next;
}
