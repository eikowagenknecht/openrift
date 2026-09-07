/**
 * Awaits a mutation and swallows its rejection; the QueryClient's default
 * `onError` (`reportMutationError`) already raises the error toast.
 */
export async function runReportedMutation(action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch {
    // Swallowed: reportMutationError already raised the toast.
  }
}
