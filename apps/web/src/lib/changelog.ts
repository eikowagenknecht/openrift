interface ChangelogEntry {
  date: string;
  type: "feat" | "fix";
  message: string;
}

interface ChangelogGroup {
  date: string;
  entries: ChangelogEntry[];
}

export function parseChangelog(markdown: string): ChangelogGroup[] {
  const groups: ChangelogGroup[] = [];
  const sections = markdown.split(/^## /mu).slice(1);

  for (const section of sections) {
    const lines = section.trim().split("\n");
    const date = lines[0].trim();
    const entries: ChangelogEntry[] = [];

    for (const line of lines.slice(1)) {
      const match = line.match(/^- (?<type>feat|fix): (?<message>.+)$/u);
      const fields = match?.groups;
      if (fields) {
        entries.push({ date, type: fields.type as "feat" | "fix", message: fields.message });
      }
    }

    if (entries.length > 0) {
      groups.push({ date, entries });
    }
  }

  return groups;
}
