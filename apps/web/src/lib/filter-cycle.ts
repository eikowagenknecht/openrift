/**
 * A value is never both included and excluded. Toggling the sole included
 * value flips it to excluded; it does not clear it.
 */
export function cycleIncludeExclude(
  included: readonly string[],
  excluded: readonly string[],
  value: string,
): { included: string[]; excluded: string[] } {
  if (excluded.includes(value)) {
    return { included: [...included], excluded: excluded.filter((entry) => entry !== value) };
  }
  if (included.includes(value)) {
    if (included.length > 1) {
      return { included: included.filter((entry) => entry !== value), excluded: [...excluded] };
    }
    return { included: [], excluded: [...excluded, value] };
  }
  if (included.length > 0) {
    return { included: [...included, value], excluded: [...excluded] };
  }
  if (excluded.length > 0) {
    return { included: [...included], excluded: [...excluded, value] };
  }
  return { included: [...included, value], excluded: [...excluded] };
}
