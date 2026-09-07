const SUMMARY_LIMIT = 6;

const BUDGET_COUNTER = "requests";

interface CoverageNote {
  text: string | null;
  namesSkipped: boolean;
}

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
