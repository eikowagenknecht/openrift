import type { printingEventsRepo } from "../repositories/printing-events.js";

type PrintingEventsRepo = ReturnType<typeof printingEventsRepo>;

/**
 * Record a "new printing" event for the Discord notification queue.
 * Best-effort: errors are swallowed.
 *
 * @returns Resolves when the event has been recorded.
 */
export async function recordNewPrintingEvent(
  repo: PrintingEventsRepo,
  printingId: string,
): Promise<void> {
  try {
    await repo.recordNew(printingId);
  } catch {
    // Non-fatal: the printing was created successfully, notification is best-effort
  }
}
