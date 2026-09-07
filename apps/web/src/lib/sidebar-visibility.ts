export interface SidebarVisibilityRow {
  id: string;
  sidebarHidden: boolean;
}

export interface SidebarVisibilitySplit<T> {
  rows: T[];
  hiddenCount: number;
  hasHidden: boolean;
}

/**
 * Hidden rows sort to the end so a reveal grows toward the toggle. The
 * active row always renders, even when hidden.
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
