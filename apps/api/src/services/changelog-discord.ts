import type { Logger } from "@openrift/shared/logger";

import type { Fetch } from "../io.js";
import type { jobRunsRepo } from "../repositories/job-runs.js";

interface ChangelogEntry {
  type: "feat" | "fix";
  section: "highlight" | "other";
  message: string;
}

interface ChangelogSection {
  date: string;
  entries: ChangelogEntry[];
}

interface ChangelogJobResult {
  posted: number;
  lastPostedDate: string | null;
}

const DEFAULT_POST_DELAY_MS = 3000;

// Discord caps embed.description at 4096 chars. Leave headroom for any
// counting differences between JS UTF-16 length and Discord's own count.
const MAX_DESCRIPTION_CHARS = 4000;

export function parseChangelogSections(markdown: string): ChangelogSection[] {
  const sections: ChangelogSection[] = [];
  const blocks = markdown.split(/^## /mu).slice(1);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    const date = lines[0].trim();
    const entries: ChangelogEntry[] = [];
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
      const match = line.match(/^- (?<type>feat|fix)(?:\([^)]+\))?: (?<message>.+)$/u);
      const groups = match?.groups;
      if (groups) {
        entries.push({
          type: groups.type as "feat" | "fix",
          section: current,
          message: groups.message,
        });
      }
    }
    if (entries.length > 0) {
      sections.push({ date, entries });
    }
  }

  return sections.toSorted((a, b) => a.date.localeCompare(b.date));
}

function formatEntryMessage(message: string): string {
  return message.replace(/^(?<title>\*\*.+?\*\*) — /u, "$<title>: ");
}

function formatSectionLines(entries: ChangelogEntry[]): string[] {
  const feats = entries.filter((entry) => entry.type === "feat");
  const fixes = entries.filter((entry) => entry.type === "fix");
  const lines: string[] = [];
  for (const entry of feats) {
    lines.push(`🆕 ${formatEntryMessage(entry.message)}`);
  }
  for (const entry of fixes) {
    lines.push(`🔧 ${formatEntryMessage(entry.message)}`);
  }
  return lines;
}

function formatEntryLines(entries: ChangelogEntry[]): string[] {
  const highlights = entries.filter((entry) => entry.section === "highlight");
  const other = entries.filter((entry) => entry.section !== "highlight");
  if (highlights.length === 0) {
    return formatSectionLines(other);
  }
  const lines = ["__Highlights__", ...formatSectionLines(highlights)];
  if (other.length > 0) {
    lines.push("", "__Other__", ...formatSectionLines(other));
  }
  return lines;
}

function chunkLinesToFit(lines: string[], limit: number): string[][] {
  const chunks: string[][] = [];
  let current: string[] = [];
  let currentLen = 0;
  for (const line of lines) {
    const addedLen = current.length === 0 ? line.length : 1 + line.length;
    if (currentLen + addedLen > limit && current.length > 0) {
      chunks.push(current);
      current = [line];
      currentLen = line.length;
    } else {
      current.push(line);
      currentLen += addedLen;
    }
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}

export function buildDiscordPayloads(date: string, entries: ChangelogEntry[]) {
  const lines = formatEntryLines(entries);
  const chunks = chunkLinesToFit(lines, MAX_DESCRIPTION_CHARS);
  return chunks.map((chunk) => ({
    embeds: [
      {
        title: `What's new (${date})`,
        description: chunk.join("\n"),
        color: 0x24_70_5f,
      },
    ],
  }));
}

export function extractWatermark(result: unknown): string | null {
  if (result === null || typeof result !== "object") {
    return null;
  }
  const candidate = (result as { lastPostedDate?: unknown }).lastPostedDate;
  return typeof candidate === "string" ? candidate : null;
}

interface PostChangelogParams {
  webhookUrl: string | null;
  changelogPath: string;
  jobRuns: ReturnType<typeof jobRunsRepo>;
  runId: string;
  fromDate: string | null;
  log: Logger;
  postDelayMs?: number;
  fetcher?: Fetch;
  sleeper?: (ms: number) => Promise<void>;
  readFile?: (path: string) => Promise<string>;
}

// The watermark only advances after every chunk for a date is posted, so a
// crash mid-date re-posts the whole date on the next run rather than
// skipping the rest.
export async function postChangelogToDiscord(
  params: PostChangelogParams,
): Promise<ChangelogJobResult> {
  const {
    webhookUrl,
    changelogPath,
    jobRuns,
    runId,
    fromDate,
    log,
    postDelayMs = DEFAULT_POST_DELAY_MS,
    fetcher = fetch,
    sleeper = (ms) => Bun.sleep(ms),
    readFile = (path) => Bun.file(path).text(),
  } = params;

  if (!webhookUrl) {
    log.info("No DISCORD_WEBHOOK_CHANGELOG configured, skipping");
    return { posted: 0, lastPostedDate: fromDate };
  }

  let markdown: string;
  try {
    markdown = await readFile(changelogPath);
  } catch {
    log.warn({ path: changelogPath }, "Could not read changelog file");
    return { posted: 0, lastPostedDate: fromDate };
  }

  const allSections = parseChangelogSections(markdown);
  const pending = fromDate ? allSections.filter((section) => section.date > fromDate) : allSections;

  if (pending.length === 0) {
    log.info({ fromDate }, "No new changelog entries to post");
    return { posted: 0, lastPostedDate: fromDate };
  }

  log.info({ fromDate, pendingDates: pending.length }, "Posting changelog backlog to Discord");

  let posted = 0;
  let lastPostedDate = fromDate;
  let postsSent = 0;

  for (const section of pending) {
    const payloads = buildDiscordPayloads(section.date, section.entries);

    for (const payload of payloads) {
      if (postsSent > 0) {
        await sleeper(postDelayMs);
      }

      const response = await fetcher(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.text();
        log.error(
          { status: response.status, body, date: section.date },
          "Discord webhook request failed",
        );
        throw new Error(`Discord webhook ${response.status}: ${body.slice(0, 200)}`);
      }

      postsSent += 1;
    }

    posted += 1;
    lastPostedDate = section.date;
    await jobRuns.updateResult(runId, { posted, lastPostedDate });
    log.info(
      { date: section.date, count: section.entries.length, chunks: payloads.length },
      "Posted changelog section to Discord",
    );
  }

  return { posted, lastPostedDate };
}
