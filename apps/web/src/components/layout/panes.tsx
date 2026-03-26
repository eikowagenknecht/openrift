import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Pane({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <aside
      className={cn(
        "hidden sticky top-(--sticky-top) w-[400px] shrink-0 max-h-[calc(100vh-var(--sticky-top))] overflow-y-auto",
        className,
      )}
    >
      {children}
    </aside>
  );
}
