import type { FieldChange } from "../db/index.js";
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

/**
 * Record a "changed" event for the Discord notification queue.
 * Skips recording if no fields actually changed. Best-effort: errors are swallowed.
 *
 * @returns Resolves when the event has been recorded.
 */
export async function recordPrintingChangeEvent(
  repo: PrintingEventsRepo,
  printingId: string,
  changes: FieldChange[],
): Promise<void> {
  if (changes.length === 0) {
    return;
  }
  try {
    await repo.recordChange(printingId, changes);
  } catch {
    // Non-fatal: the update was applied successfully, notification is best-effort
  }
}
