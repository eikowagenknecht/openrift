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

export interface ChangelogJobResult {
  posted: number;
  lastPostedDate: string | null;
}

const DEFAULT_POST_DELAY_MS = 3000;

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
 * Checkpoints the watermark after each successful post so a crash mid-run
 * doesn't replay already-posted entries.
 *
 * @returns The number posted and the new watermark.
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

  for (const [index, section] of pending.entries()) {
    if (index > 0) {
      await sleeper(postDelayMs);
    }

    const payload = buildDiscordPayload(section.date, section.entries);
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

    posted += 1;
    lastPostedDate = section.date;
    await jobRuns.updateResult(runId, { posted, lastPostedDate });
    log.info(
      { date: section.date, count: section.entries.length },
      "Posted changelog section to Discord",
    );
  }

  return { posted, lastPostedDate };
}
