import type { ReactNode } from "react";

interface ImportRowShellProps {
  chevron: ReactNode;
  statusIcon: ReactNode;
  quantity: number;
  code?: string | null;
  name: ReactNode;
  nameSuffix?: ReactNode;
  actions: ReactNode;
}

/**
 * Layout shell for an import-preview row. Stacks vertically on mobile so the
 * action cluster wraps below the card name instead of overflowing the viewport,
 * and lays out inline from sm: upward.
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
}: ImportRowShellProps) {
  return (
    <div className="flex flex-col gap-2 px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 items-center gap-3 sm:flex-1">
        {chevron}
        {statusIcon}
        <span className="text-muted-foreground w-10 shrink-0 text-right tabular-nums">
          {quantity}&times;
        </span>
        {code && <span className="text-muted-foreground shrink-0 text-xs">{code}</span>}
        <span className="min-w-0 flex-1 truncate font-medium">
          {name}
          {nameSuffix && (
            <span className="text-muted-foreground ml-1.5 text-xs font-normal">{nameSuffix}</span>
          )}
        </span>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}

interface ImportRowRawFieldsProps {
  entries: [string, string][];
}

/**
 * Renders the key/value list of an import entry's raw parsed fields, shown
 * inside whichever expanded panel the consumer provides.
 * @returns A flex-wrap list of "key: value" pairs.
 */
export function ImportRowRawFields({ entries }: ImportRowRawFieldsProps) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
      {entries.map(([key, value]) => (
        <div key={key}>
          <span className="text-muted-foreground">{key}: </span>
          <span>{value}</span>
        </div>
      ))}
    </div>
  );
}
