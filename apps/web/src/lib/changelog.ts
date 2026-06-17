interface ChangelogEntry {
  date: string;
  type: "feat" | "fix";
  section: "highlight" | "other";
  area?: string;
  title?: string;
  message: string;
}

interface ChangelogGroup {
  date: string;
  highlights: ChangelogEntry[];
  other: ChangelogEntry[];
}

/**
 * Splits a `**Title** — body` entry into its bold title and body. Entries
 * without the ` — ` separator (e.g. legacy lines) keep their full text as the
 * message and carry no title.
 *
 * @returns the parsed title (if any) and the remaining message.
 */
function parseEntryBody(raw: string): { title?: string; message: string } {
  const match = raw.match(/^\*\*(?<title>[^*]+)\*\* — (?<message>.+)$/u);
  const fields = match?.groups;
  if (fields) {
    return { title: fields.title.trim(), message: fields.message.trim() };
  }
  return { message: raw.trim() };
}

/**
 * Parses the raw changelog markdown into per-date groups. Each `## date`
 * section may contain `### Highlights` / `### Other` sub-sections; lines that
 * appear before any sub-section (the legacy flat format) fall into `other`.
 *
 * @returns the changelog grouped by date, newest first, split into highlights
 *   and other entries.
 */
export function parseChangelog(markdown: string): ChangelogGroup[] {
  const groups: ChangelogGroup[] = [];
  const sections = markdown.split(/^## /mu).slice(1);

  for (const section of sections) {
    const lines = section.trim().split("\n");
    const date = lines[0].trim();
    const highlights: ChangelogEntry[] = [];
    const other: ChangelogEntry[] = [];

    let current: "highlight" | "other" = "other";

    for (const line of lines.slice(1)) {
      const heading = line
        .match(/^### (?<name>.+)$/u)
        ?.groups?.name.trim()
        .toLowerCase();
      if (heading) {
        current = heading === "highlights" ? "highlight" : "other";
        continue;
      }

      const match = line.match(/^- (?<type>feat|fix)(?:\((?<area>[^)]+)\))?: (?<rest>.+)$/u);
      const fields = match?.groups;
      if (!fields) {
        continue;
      }

      const { title, message } = parseEntryBody(fields.rest);
      const entry: ChangelogEntry = {
        date,
        type: fields.type as "feat" | "fix",
        section: current,
        area: fields.area?.trim(),
        title,
        message,
      };
      (current === "highlight" ? highlights : other).push(entry);
    }

    if (highlights.length > 0 || other.length > 0) {
      groups.push({ date, highlights, other });
    }
  }

  return groups;
}

export type { ChangelogEntry, ChangelogGroup };
