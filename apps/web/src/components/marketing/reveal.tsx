import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Starts visible so SSR and no-JS visitors never get hidden content; hides
 * only when off-screen and motion is allowed, then fades back in on scroll.
 */
export function Reveal({
  children,
  className,
  delayMs,
}: {
  children: ReactNode;
  className?: string;
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
