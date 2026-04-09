import type { FieldChange } from "../db/index.js";
import type { printingEventsRepo } from "../repositories/printing-events.js";

type PrintingEventsRepo = ReturnType<typeof printingEventsRepo>;

/**
 * Record a "new printing" event for the Discord notification queue.
 * Fire-and-forget: errors are logged but don't block the caller.
 *
 * @returns Resolves when the event has been recorded.
 */
export async function recordNewPrintingEvent(
  printingEventsRepoInstance: PrintingEventsRepo,
  data: {
    printingId: string;
    cardName: string;
    setName?: string | null;
    shortCode?: string | null;
    rarity?: string | null;
    finish?: string | null;
    artist?: string | null;
    language?: string | null;
  },
): Promise<void> {
  try {
    await printingEventsRepoInstance.recordNewPrinting(data);
  } catch {
    // Non-fatal: the printing was created successfully, notification is best-effort
  }
}

/**
 * Record a "changed" event for the Discord notification queue.
 * Skips recording if no fields actually changed.
 *
 * @returns Resolves when the event has been recorded.
 */
export async function recordPrintingChangeEvent(
  printingEventsRepoInstance: PrintingEventsRepo,
  data: {
    printingId: string;
    cardName: string;
    setName?: string | null;
    shortCode?: string | null;
    changes: FieldChange[];
  },
): Promise<void> {
  if (data.changes.length === 0) {
    return;
  }
  try {
    await printingEventsRepoInstance.recordPrintingChange(data);
  } catch {
    // Non-fatal: the update was applied successfully, notification is best-effort
  }
}
