import type { ActionsColumn } from "@/components/cards/card-table-row";

/**
 * Picks the actions-column variant for the /collections table.
 *
 * The actions column holds the per-printing count and add controls, so it only
 * belongs on stacked rows that stand in for N copies. A copies-view row
 * (`!stacked`) is a single physical copy — its count is always 1 and the
 * per-printing controls don't apply — so it gets no actions column at all,
 * mirroring how copies-view grid tiles drop the count strip. Otherwise browse
 * mode with quick-add shows the stepper +/- variant; select mode (or a surface
 * without quick-add) shows the narrow read-only count.
 * @returns The actions-column variant for the table.
 */
export function collectionTableActionsColumn({
  stacked,
  mode,
  hasQuickAdd,
}: {
  stacked: boolean;
  mode: "browse" | "select";
  hasQuickAdd: boolean;
}): ActionsColumn {
  if (!stacked) {
    return "none";
  }
  return mode === "browse" && hasQuickAdd ? "stepper" : "narrow";
}
