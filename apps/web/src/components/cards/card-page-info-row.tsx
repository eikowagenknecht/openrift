import type { ReactNode } from "react";

export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    // oxlint-disable-next-line jsx-a11y/control-has-associated-label -- presentational info-table row, not a control
    <tr>
      <td className="text-muted-foreground w-24 py-1 pr-2 align-top text-xs font-medium">
        <div className="flex min-h-6 flex-col justify-center">{label}</div>
      </td>
      <td className="py-1 align-top">
        <div className="flex min-h-6 flex-col justify-center">{children}</div>
      </td>
    </tr>
  );
}
