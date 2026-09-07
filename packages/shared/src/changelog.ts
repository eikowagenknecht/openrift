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
 * without the ` — ` separator keep their full text as the message.
 */
function parseEntryBody(raw: string): { title?: string; message: string } {
  const match = /^\*\*(?<title>[^*]+)\*\* — (?<message>.+)$/u.exec(raw);
  const title = match?.groups?.title;
  const message = match?.groups?.message;
  if (title !== undefined && message !== undefined) {
    return { title: title.trim(), message: message.trim() };
  }
  return { message: raw.trim() };
}

/**
 * Each `## date` section may contain `### Highlights` / `### Other`
 * sub-sections; lines before any sub-section fall into `other`.
 */
export function parseChangelog(markdown: string): ChangelogGroup[] {
  const groups: ChangelogGroup[] = [];
  const sections = markdown.split(/^## /mu).slice(1);

  for (const section of sections) {
    const [dateLine, ...body] = section.trim().split("\n");
    if (dateLine === undefined) {
      continue;
    }
    const date = dateLine.trim();
    const highlights: ChangelogEntry[] = [];
    const other: ChangelogEntry[] = [];

    let current: "highlight" | "other" = "other";

    for (const line of body) {
      const heading = /^### (?<name>.+)$/u.exec(line)?.groups?.name?.trim().toLowerCase();
      if (heading) {
        current = heading === "highlights" ? "highlight" : "other";
        continue;
      }

      const match = /^- (?<type>feat|fix)(?:\((?<area>[^)]+)\))?: (?<rest>.+)$/u.exec(line);
      const fields = match?.groups;
      if (!fields || fields.rest === undefined) {
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
