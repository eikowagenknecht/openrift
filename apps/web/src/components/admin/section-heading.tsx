import type { ReactNode } from "react";

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h4 className="text-muted-foreground mb-3 text-xs font-semibold tracking-wide uppercase">
      {children}
    </h4>
  );
}
