function formatOrdinal(value: number): string {
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 13) {
    return `${value}th`;
  }
  const suffixes: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };
  return `${value}${suffixes[value % 10] ?? "th"}`;
}

/**
 * Renders a standings row's finish (ADR-014).
 *
 * A source that publishes exact standings sets `rankIsTier = false` and the
 * rank prints as an ordinal ("1st", "4th", "8th"). A source that only publishes
 * cut buckets sets the flag: 1 and 2 are still the podium, and 3 up print as
 * "T4", "T8", a bucket rather than a placing.
 *
 * @returns The finish as every archive surface prints it, the share image included.
 */
export function formatRank(rank: number, rankIsTier: boolean): string {
  if (!rankIsTier) {
    return formatOrdinal(rank);
  }
  const podium: Record<number, string> = { 1: "1st", 2: "2nd" };
  return podium[rank] ?? `T${rank}`;
}

/**
 * A player's match record, always as the full "14-1-0". A source that publishes
 * no draw column ran no draws to report, so the missing count prints as zero
 * rather than shortening the record: a column mixing "5-1" and "5-1-0" reads as
 * two different kinds of number.
 *
 * @returns The record, or null when the source published none, which the
 *   display leaves out rather than inventing a 0-0-0.
 */
export function formatRecord(
  wins: number | null,
  losses: number | null,
  draws: number | null,
): string | null {
  if (wins === null || losses === null) {
    return null;
  }
  return `${wins}-${losses}-${draws ?? 0}`;
}
