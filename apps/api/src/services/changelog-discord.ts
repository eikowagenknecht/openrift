import type { Logger } from "@openrift/shared/logger";

import type { jobRunsRepo } from "../repositories/job-runs.js";

interface ChangelogEntry {
  type: "feat" | "fix";
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

/**
 * Parses a changelog markdown document into all dated sections.
 * Sections without any feat/fix entries are dropped.
 *
 * @returns Sections sorted oldest-first by date.
 */
export function parseChangelogSections(markdown: string): ChangelogSection[] {
  const sections: ChangelogSection[] = [];
  const blocks = markdown.split(/^## /m).slice(1);

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    const date = lines[0].trim();
    const entries: ChangelogEntry[] = [];
    for (const line of lines.slice(1)) {
      const match = line.match(/^- (feat|fix): (.+)$/);
      if (match) {
        entries.push({ type: match[1] as "feat" | "fix", message: match[2] });
      }
    }
    if (entries.length > 0) {
      sections.push({ date, entries });
    }
  }

  return sections.toSorted((a, b) => a.date.localeCompare(b.date));
}

function formatEntryLines(entries: ChangelogEntry[]): string[] {
  const feats = entries.filter((entry) => entry.type === "feat");
  const fixes = entries.filter((entry) => entry.type === "fix");
  const lines: string[] = [];
  for (const entry of feats) {
    lines.push(`🆕 ${entry.message}`);
  }
  for (const entry of fixes) {
    lines.push(`🔧 ${entry.message}`);
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

/**
 * Builds one or more Discord webhook payloads for a single date's entries.
 * A long day's worth of entries is split across multiple payloads so each
 * description stays under Discord's 4096-char embed limit.
 *
 * @returns One payload per chunk, in display order.
 */
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

/**
 * Extracts a watermark date from a prior job run's stored result.
 *
 * @returns The last-posted date string, or null if no usable watermark.
 */
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
  fetcher?: typeof fetch;
  sleeper?: (ms: number) => Promise<void>;
  readFile?: (path: string) => Promise<string>;
}

/**
 * Posts every changelog section dated strictly after `fromDate` to the
 * Discord webhook, oldest first, throttled to one message per `postDelayMs`.
 * Long sections are split across multiple webhook posts so each embed
 * stays under Discord's 4096-char description limit. The watermark only
 * advances after every chunk for a date is posted, so a crash mid-date
 * re-posts the whole date on the next run rather than skipping the rest.
 *
 * @returns The number of dates posted and the new watermark.
 */
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
