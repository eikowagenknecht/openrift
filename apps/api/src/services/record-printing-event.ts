import type { printingEventsRepo } from "../repositories/printing-events.js";

type PrintingEventsRepo = ReturnType<typeof printingEventsRepo>;

/** Best-effort: errors are swallowed. */
export async function recordNewPrintingEvent(
  repo: PrintingEventsRepo,
  printingId: string,
): Promise<void> {
  try {
    await repo.recordNew(printingId);
  } catch {
    // Swallowed: best-effort notification, printing creation already succeeded.
  }
}
