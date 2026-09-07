import type { Printing } from "@openrift/shared";
import { MAX_COPIES_PER_ADD } from "@openrift/shared/contracts/copies";

import { randomUuid } from "@/lib/random-uuid";

export interface ScanAddJob {
  id: string;
  printingId: string;
}

export interface ScanAddOutcome {
  confirmed: Map<string, number>;
  copyIds: string[];
  failed: number;
}

/** One job per copy, so the batcher folds a chunk into a single POST. */
export function addJobsFor(rows: readonly { printing: Printing; count: number }[]): ScanAddJob[] {
  const jobs: ScanAddJob[] = [];
  for (const row of rows) {
    for (let i = 0; i < row.count; i++) {
      jobs.push({ id: randomUuid(), printingId: row.printing.id });
    }
  }
  return jobs;
}

export function reconcileJobs(
  pendingJobs: readonly ScanAddJob[],
  rows: readonly { printing: Printing; count: number }[],
): ScanAddJob[] {
  const available = new Map<string, string[]>();
  for (const job of pendingJobs) {
    const ids = available.get(job.printingId) ?? [];
    ids.push(job.id);
    available.set(job.printingId, ids);
  }
  const jobs: ScanAddJob[] = [];
  for (const row of rows) {
    const ids = available.get(row.printing.id) ?? [];
    for (let i = 0; i < row.count; i++) {
      jobs.push({ id: ids[i] ?? randomUuid(), printingId: row.printing.id });
    }
  }
  return jobs;
}

/** Chunked to the contract's per-request cap, which a whole booster box can exceed. */
export async function addInChunks(
  jobs: readonly ScanAddJob[],
  addOne: (job: ScanAddJob) => Promise<{ id: string }>,
): Promise<PromiseSettledResult<{ id: string }>[]> {
  const outcomes: PromiseSettledResult<{ id: string }>[] = [];
  for (let i = 0; i < jobs.length; i += MAX_COPIES_PER_ADD) {
    const chunk = jobs.slice(i, i + MAX_COPIES_PER_ADD);
    // Queued in one tick so the batcher folds the chunk into a single POST.
    const settled = await Promise.allSettled(chunk.map((job) => addOne(job)));
    outcomes.push(...settled);
  }
  return outcomes;
}

export function settleAdd(
  jobs: readonly ScanAddJob[],
  outcomes: readonly PromiseSettledResult<{ id: string }>[],
): ScanAddOutcome {
  const confirmed = new Map<string, number>();
  const copyIds: string[] = [];
  let failed = 0;
  for (const [index, job] of jobs.entries()) {
    const outcome = outcomes[index];
    if (outcome === undefined || outcome.status === "rejected") {
      failed += 1;
      continue;
    }
    const copyId = outcome.value?.id;
    if (copyId === undefined) {
      failed += 1;
      continue;
    }
    confirmed.set(job.printingId, (confirmed.get(job.printingId) ?? 0) + 1);
    copyIds.push(copyId);
  }
  return { confirmed, copyIds, failed };
}
