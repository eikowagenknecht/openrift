interface JobRunsRead {
  getResult: (id: string) => Promise<unknown>;
}
interface JobRunsWrite {
  mergeResult: (id: string, patch: object) => Promise<void>;
}

// Read off the bare flag, not a checkpoint shape: crawls and the recheck
// write different result objects into the same column.
export async function runCancelRequested(jobRuns: JobRunsRead, runId: string): Promise<boolean> {
  const stored = await jobRuns.getResult(runId);
  return (
    typeof stored === "object" &&
    stored !== null &&
    (stored as { cancelRequested?: unknown }).cancelRequested === true
  );
}

// Must merge, not replace: a cancel written while this beat was assembling has to survive.
export async function writeRunHeartbeat(
  jobRuns: JobRunsWrite,
  runId: string,
  result: object,
  now: Date,
): Promise<void> {
  await jobRuns.mergeResult(runId, { ...result, heartbeatAt: now.toISOString() });
}
