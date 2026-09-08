const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

const MONTH_YEAR = /^(?<month>[a-z]+)\s+(?<year>\d{4})$/u;

export function slugifyLabel(label: string): string {
  const trimmed = label.trim().toLowerCase();
  const monthYear = MONTH_YEAR.exec(trimmed);
  const monthName = monthYear?.groups?.month;
  const year = monthYear?.groups?.year;
  if (monthName !== undefined && year !== undefined) {
    const month = MONTHS.indexOf(monthName);
    if (month !== -1) {
      return `${year}-${String(month + 1).padStart(2, "0")}`;
    }
  }
  return trimmed
    .normalize("NFKD")
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "");
}

export function commonSlugPrefix(slugs: readonly string[]): string {
  const parts = slugs.map((slug) => slug.split("-"));
  const first = parts.at(0);
  if (!first || parts.length === 0) {
    return "";
  }
  const shared: string[] = [];
  for (const [index, segment] of first.entries()) {
    if (!parts.every((candidate) => candidate[index] === segment)) {
      break;
    }
    // A slug that is entirely the shared prefix would leave the new one
    // colliding with it, so stop one segment short of the shortest sibling.
    if (parts.some((candidate) => candidate.length === index + 1)) {
      break;
    }
    shared.push(segment);
  }
  return shared.join("-");
}

/** The siblings' shared prefix, else the parent's slug, then the label. */
export function suggestChannelSlug({
  parentSlug,
  siblingSlugs,
  label,
}: {
  parentSlug: string;
  siblingSlugs: readonly string[];
  label: string;
}): string {
  const tail = slugifyLabel(label);
  if (tail.length === 0) {
    return "";
  }
  const prefix = commonSlugPrefix(siblingSlugs) || parentSlug;
  if (prefix.length === 0 || tail.startsWith(`${prefix}-`)) {
    return tail;
  }
  return [prefix, trimOverlap(prefix, tail)].filter((part) => part.length > 0).join("-");
}

/** Siblings named `city-2026-09` share `city-2026`, which a `2026-10` tail would repeat. */
function trimOverlap(prefix: string, tail: string): string {
  const last = prefix.split("-").at(-1);
  const segments = tail.split("-");
  while (segments.length > 0 && segments.at(0) === last) {
    segments.shift();
  }
  return segments.join("-");
}
