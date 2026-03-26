import type { ReactNode } from "react";

export function MobileDetailOverlay({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background md:hidden">{children}</div>
  );
}
