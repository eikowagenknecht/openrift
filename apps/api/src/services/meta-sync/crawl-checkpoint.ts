interface JobRunsRead {
  getResult: (id: string) => Promise<unknown>;
}
interface JobRunsWrite {
  mergeResult: (id: string, patch: object) => Promise<void>;
}

/**
 * Whether the admin asked the running job to stop, read off the flag rather
 * than off a whole checkpoint shape: the crawls and the recheck write different
 * result objects into the same column, and both have to honour the same Stop.
 * Anything else on the row reads as not-cancelled rather than throwing.
 */
export async function runCancelRequested(jobRuns: JobRunsRead, runId: string): Promise<boolean> {
  const stored = await jobRuns.getResult(runId);
  return (
    typeof stored === "object" &&
    stored !== null &&
    (stored as { cancelRequested?: unknown }).cancelRequested === true
  );
}

/**
 * Writes the run's progress with a fresh liveness stamp. Merged rather than
 * replaced, so a cancel that landed while the job was assembling this beat is
 * still on the row when the next beat reads it.
 */
export async function writeRunHeartbeat(
  jobRuns: JobRunsWrite,
  runId: string,
  result: object,
  now: Date,
): Promise<void> {
  await jobRuns.mergeResult(runId, { ...result, heartbeatAt: now.toISOString() });
}
