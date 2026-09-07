export type ActionsColumn = "none" | "narrow" | "stepper" | "wide";

/** Mirrors how copies-view grid tiles drop the count strip for unstacked rows. */
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
