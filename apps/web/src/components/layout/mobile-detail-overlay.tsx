import type { ReactNode } from "react";

export function MobileDetailOverlay({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background fixed inset-0 z-50 overflow-y-auto md:hidden">{children}</div>
  );
}
