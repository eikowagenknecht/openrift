import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Fades and rises content in the first time it scrolls into view. Starts
 * visible on purpose: the server render and no-JS visitors must never get
 * hidden content, and above-the-fold sections must not flash. The effect
 * hides the element only when it is below the viewport, motion allowed.
 */
export function Reveal({
  children,
  className,
  delayMs,
}: {
  children: ReactNode;
  className?: string;
  /** Staggers the rise-in behind a sibling Reveal. Only delays the entrance. */
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [offscreen, setOffscreen] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    if (globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    if (node.getBoundingClientRect().top <= globalThis.innerHeight) {
      return;
    }
    setOffscreen(true);
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setOffscreen(false);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -64px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={cn(
        "transition-[opacity,translate] duration-700 ease-out",
        offscreen && "translate-y-6 opacity-0",
        className,
      )}
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  );
}
