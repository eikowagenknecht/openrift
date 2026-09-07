import type { ReactNode } from "react";

interface ImportRowShellProps {
  chevron: ReactNode;
  statusIcon: ReactNode;
  quantity: number;
  code?: string | null;
  name: ReactNode;
  nameSuffix?: ReactNode;
  actions?: ReactNode;
  trailing?: ReactNode;
}

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
  matched?: ReactNode;
}

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
