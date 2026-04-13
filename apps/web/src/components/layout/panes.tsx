import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Pane({
  children,
  className,
  "data-testid": testId,
}: {
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <aside
      className={cn(
        "sticky top-(--sticky-top) hidden max-h-[calc(100vh-var(--sticky-top))] w-[400px] shrink-0 overflow-y-auto pt-3",
        className,
      )}
      data-testid={testId}
    >
      {children}
    </aside>
  );
}
