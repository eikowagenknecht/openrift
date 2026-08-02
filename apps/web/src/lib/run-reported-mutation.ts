/**
 * Runs a fire-and-forget mutation and swallows its rejection. The
 * QueryClient's default mutation `onError` (see `reportMutationError` in
 * `query-client.ts`) already raises the error toast for every mutation, so a
 * caller that just wants to `await` a settle-either-way point (e.g. to close
 * a dialog afterwards, success or not) doesn't need its own try/catch.
 * @param action - The async mutation to run, typically `() => someMutation.mutateAsync(...)`.
 * @returns A promise that always resolves, once `action` settles.
 */
export async function runReportedMutation(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch {
    // Reported by the global mutation error toast (see reportMutationError).
  }
}
