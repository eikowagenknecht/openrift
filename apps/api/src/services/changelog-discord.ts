import type { Logger } from "@openrift/shared/logger";

interface ChangelogEntry {
  type: "feat" | "fix";
  message: string;
}

/**
 * Parses a changelog markdown string and returns entries for the given date.
 *
 * @returns Entries matching the date, or an empty array if none found.
 */
export function parseChangelogForDate(markdown: string, date: string): ChangelogEntry[] {
  const sections = markdown.split(/^## /m).slice(1);

  for (const section of sections) {
    const lines = section.trim().split("\n");
    const sectionDate = lines[0].trim();
    if (sectionDate !== date) {
      continue;
    }

    const entries: ChangelogEntry[] = [];
    for (const line of lines.slice(1)) {
      const match = line.match(/^- (feat|fix): (.+)$/);
      if (match) {
        entries.push({ type: match[1] as "feat" | "fix", message: match[2] });
      }
    }
    return entries;
  }

  return [];
}

/**
 * Builds a Discord webhook payload from changelog entries.
 *
 * @returns The JSON body to POST to a Discord webhook URL.
 */
export function buildDiscordPayload(date: string, entries: ChangelogEntry[]) {
  const feats = entries.filter((entry) => entry.type === "feat");
  const fixes = entries.filter((entry) => entry.type === "fix");

  const lines: string[] = [];
  for (const entry of feats) {
    lines.push(`🆕 ${entry.message}`);
  }
  for (const entry of fixes) {
    lines.push(`🔧 ${entry.message}`);
  }

  return {
    embeds: [
      {
        title: `What's new (${date})`,
        description: lines.join("\n"),
        color: 0x24_70_5f,
      },
    ],
  };
}

/**
 * Reads today's changelog entries and posts them to Discord if the webhook is configured.
 *
 * @returns Whether a message was posted.
 */
export async function postChangelogToDiscord(
  webhookUrl: string | null,
  changelogPath: string,
  log: Logger,
): Promise<boolean> {
  if (!webhookUrl) {
    log.info("No DISCORD_WEBHOOK_CHANGELOG configured, skipping");
    return false;
  }

  const today = new Date().toISOString().slice(0, 10);

  let markdown: string;
  try {
    markdown = await Bun.file(changelogPath).text();
  } catch {
    log.warn({ path: changelogPath }, "Could not read changelog file");
    return false;
  }

  const entries = parseChangelogForDate(markdown, today);
  if (entries.length === 0) {
    log.info({ date: today }, "No changelog entries for today");
    return false;
  }

  const payload = buildDiscordPayload(today, entries);

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    log.error(
      { status: response.status, body: await response.text() },
      "Discord webhook request failed",
    );
    return false;
  }

  log.info({ date: today, count: entries.length }, "Posted changelog to Discord");
  return true;
}
