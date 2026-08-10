import type { ReactNode } from "react";

interface ImportRowShellProps {
  chevron: ReactNode;
  statusIcon: ReactNode;
  quantity: number;
  code?: string | null;
  name: ReactNode;
  nameSuffix?: ReactNode;
  /** Omitted when the caller moves the controls into the row's expanded panel. */
  actions?: ReactNode;
  /**
   * Read-only label pinned to the right, before the status mark. For standing in
   * for a control that has been folded away (e.g. the zone a card lands in).
   */
  trailing?: ReactNode;
}

/**
 * Layout shell for an import-preview row. The row leads with what identifies the
 * card — "3× Incinerate" — and pins the status mark and the fold chevron to the
 * right edge, top-aligned so they stay put when the left side grows to two lines.
 * The action cluster sits beside the name from sm: upward and wraps below it on
 * phones, where it keeps the row's left edge (nothing precedes it) rather than
 * hanging off an indent. A caller that moves its controls into the expanded
 * panel instead passes no `actions` at all, so the row leaves no empty slot.
 *
 * The caller owns the outer wrapper element (e.g. `<div>` vs `<AccordionItem>`),
 * the `isSkipped` opacity treatment, and the expanded-content panel below.
 * @returns A single row's flex layout, without the surrounding wrapper.
 */
export function ImportRowShell({
  chevron,
  statusIcon,
  quantity,
  code,
  name,
  nameSuffix,
  actions,
  trailing,
}: ImportRowShellProps) {
  return (
    <div className="flex items-start gap-3 px-4 py-2.5 text-sm">
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <span className="min-w-0 flex-1 truncate">
          <span className="text-muted-foreground tabular-nums">{quantity}&times;</span>{" "}
          <span className="font-medium">{name}</span>
          {code && <span className="text-muted-foreground ml-1.5 text-xs">{code}</span>}
          {nameSuffix && (
            <span className="text-muted-foreground ml-1.5 text-xs font-normal">{nameSuffix}</span>
          )}
        </span>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {/* pt-0.5 centres the 16px marks against the first 20px text line, which
          `items-start` alone would leave sitting 2px high. */}
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {trailing}
        {statusIcon}
        {chevron}
      </div>
    </div>
  );
}

interface ImportRowRawFieldsProps {
  entries: [string, string][];
  /**
   * What the row resolved to, when the source values don't already say it. The
   * row's title shows the matched card, so without this the panel reads as a
   * contradiction whenever the match corrected what was written.
   */
  matched?: ReactNode;
}

/**
 * Renders what the importer read for one entry: the parsed source values, and
 * optionally the card they resolved to. Shown inside whichever expanded panel
 * the consumer provides.
 * @returns The parsed source values, with the match note when given.
 */
export function ImportRowRawFields({ entries, matched }: ImportRowRawFieldsProps) {
  return (
    <div className="space-y-1 text-xs">
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {entries.map(([key, value]) => (
          <div key={key}>
            <span className="text-muted-foreground">{key}: </span>
            <span>{value}</span>
          </div>
        ))}
      </div>
      {matched && <p className="text-muted-foreground">{matched}</p>}
    </div>
  );
}
