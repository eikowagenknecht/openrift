// Pure display helpers for a stored `job_runs.result`, read by the admin job
// runs table and by the meta sync's trigger toasts.

/** How many counters of a job result the compact summary shows. */
const SUMMARY_LIMIT = 6;

/** The counter that is the crawl's actual budget, so it leads the summary. */
const BUDGET_COUNTER = "requests";

/** The coverage note, and whether it has already spent the skipped counter. */
interface CoverageNote {
  text: string | null;
  namesSkipped: boolean;
}

/**
 * How a crawl that fell short of its own window reads. A partial pass is the
 * one thing the counters cannot say on their own: a crawl that stopped at the
 * first refused page still reports a healthy-looking row count, which is how a
 * third of the catalogue sat stale behind a green run for a week.
 */
function coverageNote(result: Record<string, unknown> | null): CoverageNote {
  if (result === null || result.complete !== false) {
    return { text: null, namesSkipped: false };
  }
  if (result.cancelRequested === true) {
    return { text: "cancelled", namesSkipped: false };
  }
  const skipped = typeof result.skipped === "number" ? result.skipped : 0;
  if (skipped === 0) {
    return { text: "incomplete", namesSkipped: false };
  }
  return { text: `incomplete, ${skipped.toLocaleString()} skipped`, namesSkipped: true };
}

/**
 * The countable part of a job's result, as one line. Every job summarizes
 * itself as a bag of counters, so the numbers are the summary and the rest of
 * the payload stays in the expandable detail.
 *
 * Requests come first whatever order the job wrote its counters in: they are
 * what a crawl spends, and a row count read as a cost makes a cheap poll look
 * alarming. A partial pass leads with saying so, ahead of every counter, and
 * the skipped count it names is dropped from the counters rather than printed
 * twice.
 *
 * @param result - The run's stored result.
 * @returns The counters, or an empty string when the result holds none.
 */
export function summarizeRunResult(result: Record<string, unknown> | null): string {
  if (result === null) {
    return "";
  }
  const note = coverageNote(result);
  const counters: [string, number][] = [];
  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "number" && !(note.namesSkipped && key === "skipped")) {
      counters.push([key, value]);
    }
  }
  const budget = counters.filter(([key]) => key === BUDGET_COUNTER);
  const rest = counters.filter(([key]) => key !== BUDGET_COUNTER);
  return [
    ...(note.text === null ? [] : [note.text]),
    ...[...budget, ...rest]
      .slice(0, SUMMARY_LIMIT)
      .map(([key, value]) => `${value.toLocaleString()} ${key}`),
  ].join(" · ");
}
