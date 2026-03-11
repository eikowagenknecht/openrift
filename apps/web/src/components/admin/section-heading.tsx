import type { ReactNode } from "react";

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h4>
  );
}
