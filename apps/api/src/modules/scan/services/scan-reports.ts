import type { ScanReportJournalEntry } from "@openrift/shared/contracts/scan-reports";
import { createLogger } from "@openrift/shared/logger";

import type { Repos, Transact } from "../../../deps.js";

const log = createLogger("scan-reports");

const HOUR_MS = 60 * 60 * 1000;

export const SCAN_REPORT_HOURLY_LIMIT = 5;

const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const REFERENCE_LENGTH = 4;

const REFERENCE_ATTEMPTS = 10;

export type ScanReportResult =
  | { status: "ok"; reference: string }
  | { status: "rate_limited"; limit: number };

function mintReference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(REFERENCE_LENGTH));
  let out = "SC-";
  for (const byte of bytes) {
    out += REFERENCE_ALPHABET.charAt(byte % REFERENCE_ALPHABET.length);
  }
  return out;
}

async function freeReference(repos: Repos): Promise<string> {
  for (let attempt = 0; attempt < REFERENCE_ATTEMPTS; attempt++) {
    const reference = mintReference();
    const taken = await repos.scanReports.referenceExists(reference);
    if (!taken) {
      return reference;
    }
  }
  throw new Error("Could not mint a free scan report reference");
}

function batchIdsIn(journal: readonly ScanReportJournalEntry[]): string[] {
  const ids = new Set<string>();
  for (const entry of journal) {
    if (typeof entry.batchId === "string") {
      ids.add(entry.batchId);
    }
  }
  return [...ids];
}

export async function createScanReport(
  transact: Transact,
  args: {
    userId: string;
    note: string | null;
    userAgent: string | null;
    journal: ScanReportJournalEntry[];
    now: Date;
  },
): Promise<ScanReportResult> {
  const { userId, note, userAgent, journal, now } = args;

  const result = await transact(async (trxRepos) => {
    await trxRepos.scanReports.lockUser(userId);
    const recent = await trxRepos.scanReports.countRecentByUser(
      userId,
      new Date(now.getTime() - HOUR_MS),
    );
    if (recent >= SCAN_REPORT_HOURLY_LIMIT) {
      return { status: "rate_limited", limit: SCAN_REPORT_HOURLY_LIMIT } as const;
    }

    const reference = await freeReference(trxRepos);
    await trxRepos.scanReports.insert({ userId, reference, note, userAgent, journal });
    return { status: "ok", reference } as const;
  });

  if (result.status === "ok") {
    log.info(
      { userId, reference: result.reference, batchIds: batchIdsIn(journal) },
      "scan report received",
    );
  }

  return result;
}
