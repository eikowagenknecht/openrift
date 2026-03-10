import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { CardScatter } from "./card-scatter";

export function HeroBackground({
  children,
  className,
  cardResetKey,
  onAllCollected,
}: {
  children: ReactNode;
  className?: string;
  cardResetKey?: number;
  onAllCollected?: () => void;
}) {
  return (
    <div className={cn("relative flex flex-1 flex-col overflow-hidden", className)}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: "var(--hero-gradient)" }}
        aria-hidden="true"
      />
      {/* Dot grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-[0.25]"
        style={{
          backgroundImage: "radial-gradient(circle, oklch(0.4 0.05 185) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
        aria-hidden="true"
      />
      <CardScatter
        key={cardResetKey}
        className="z-[1]"
        flyIn={cardResetKey !== undefined && cardResetKey > 0}
        onAllCollected={onAllCollected}
      />
      <div className="pointer-events-none relative z-10 flex flex-1 flex-col [&_a]:pointer-events-auto [&_button]:pointer-events-auto">
        {children}
      </div>
    </div>
  );
}
