import { useState } from "react";

/**
 * How many rows a trade list shows before folding the rest behind its
 * "Show more" toggle. Five keeps a two-column grid at a clean three rows once
 * the toggle takes the sixth cell, and leaves a member's block skimmable in a
 * single column.
 */
export const CAPPED_ROWS_LIMIT = 5;

/** The fold's toggle state, as consumed by a "Show more" row. */
export interface CappedRowsFold {
  /** How many rows the fold is hiding right now; 0 while expanded or unfolded. */
  hiddenCount: number;
  /** Whether the list is long enough to fold at all — render no toggle when false. */
  foldable: boolean;
  expanded: boolean;
  toggle: () => void;
}

export interface CappedRows<T> extends CappedRowsFold {
  /** The rows to render: the first `limit` while folded, all of them once expanded. */
  rows: T[];
}

/**
 * Folds a long list down to its first `limit` rows until the viewer asks for
 * the rest. A member with dozens of open trades otherwise pushes everything
 * else on the page below the fold.
 *
 * The cap only engages from two hidden rows up: hiding a single row costs a
 * toggle row to show it again, so it saves nothing and just adds a click.
 * @returns The visible rows and the toggle state driving them.
 */
export function useCappedRows<T>(items: T[], limit: number = CAPPED_ROWS_LIMIT): CappedRows<T> {
  const [expanded, setExpanded] = useState(false);

  const foldable = items.length > limit + 1;
  const folded = foldable && !expanded;
  return {
    rows: folded ? items.slice(0, limit) : items,
    hiddenCount: folded ? items.length - limit : 0,
    foldable,
    expanded,
    toggle: () => setExpanded((value) => !value),
  };
}
