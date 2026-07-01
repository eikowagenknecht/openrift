/**
 * The tri-state include/exclude transition (ADR-034) shared by the filter badges
 * (Domain/Rarity toggle groups) and the filter dropdowns' cycling rows, so both
 * cycle a value the same way. An axis is never include AND exclude at once: `+a
 * +b` already drops everything else, so a stray `−c` alongside it is a no-op. So
 * a click keeps the axis in one mode:
 *  • off value, empty axis        → include it (the usual first pick)
 *  • off value, axis has includes → add to the include set
 *  • off value, axis has excludes → add to the exclude set
 *  • included, other includes left → just deselect (excluding it would be redundant)
 *  • the sole included value        → flip the axis to "all but this" (exclude)
 *  • excluded value                 → off
 * The sole-include flip is the on-ramp into exclude-mode; from a fresh axis a
 * second click on the same value reaches "exclude", a third clears it.
 * @returns The next include/exclude arrays after cycling `value`.
 */
export function cycleIncludeExclude(
  included: readonly string[],
  excluded: readonly string[],
  value: string,
): { included: string[]; excluded: string[] } {
  if (excluded.includes(value)) {
    // excluded → off
    return { included: [...included], excluded: excluded.filter((entry) => entry !== value) };
  }
  if (included.includes(value)) {
    if (included.length > 1) {
      // one of several includes → deselect (excluding it would be redundant)
      return { included: included.filter((entry) => entry !== value), excluded: [...excluded] };
    }
    // the sole include → flip the axis into exclude-mode ("all but this")
    return { included: [], excluded: [...excluded, value] };
  }
  if (included.length > 0) {
    // off, axis already including → keep building the include set
    return { included: [...included, value], excluded: [...excluded] };
  }
  if (excluded.length > 0) {
    // off, axis already excluding → keep building the exclude set
    return { included: [...included], excluded: [...excluded, value] };
  }
  // off, empty axis → start with include
  return { included: [...included, value], excluded: [...excluded] };
}
