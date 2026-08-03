/** A sidebar row that can be pushed behind the group's "Show more" toggle. */
export interface SidebarVisibilityRow {
  id: string;
  sidebarHidden: boolean;
}

export interface SidebarVisibilitySplit<T> {
  /** Rows to render, in display order: the visible ones, then any revealed. */
  rows: T[];
  /** How many hidden rows are still folded away — the "Show N more" count. */
  hiddenCount: number;
  /** Whether the group has any hidden rows at all, revealed or not. */
  hasHidden: boolean;
}

/**
 * Splits one sidebar group's rows into what to render now and what stays
 * behind the "Show more" toggle.
 *
 * Hidden rows sort to the end rather than staying in place, so a reveal grows
 * the list downward towards the toggle that produced it instead of inserting
 * rows the user has to hunt for. The active row is always rendered even when
 * hidden — navigating to a hidden list would otherwise look like the sidebar
 * lost the page you are on.
 *
 * @returns The rows to render plus the counts the toggle needs.
 */
export function splitSidebarRows<T extends SidebarVisibilityRow>(
  rows: readonly T[],
  options: { expanded: boolean; activeId?: string },
): SidebarVisibilitySplit<T> {
  const visible: T[] = [];
  const revealed: T[] = [];
  let hiddenCount = 0;
  let hasHidden = false;

  for (const row of rows) {
    if (!row.sidebarHidden) {
      visible.push(row);
      continue;
    }
    hasHidden = true;
    if (options.expanded || row.id === options.activeId) {
      revealed.push(row);
    } else {
      hiddenCount += 1;
    }
  }

  return { rows: [...visible, ...revealed], hiddenCount, hasHidden };
}
