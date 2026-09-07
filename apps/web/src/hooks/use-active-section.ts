import { useEffect, useRef, useState } from "react";

// Must match CardGrid's sticky-pill "active" definition.
export function useActiveSection(
  entries: { id: string; label: string }[],
  threshold: number,
): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);
  const entriesRef = useRef(entries);
  const thresholdRef = useRef(threshold);

  useEffect(() => {
    entriesRef.current = entries;
    thresholdRef.current = threshold;
  });

  useEffect(() => {
    const update = () => {
      const list = entriesRef.current;
      const limit = thresholdRef.current + 4;
      let active: string | null = null;
      for (const entry of list) {
        // oxlint-disable-next-line prefer-query-selector -- ids derive from channel ids that may start with a digit; getElementById skips CSS-escape gymnastics.
        const el = document.getElementById(entry.id);
        if (!el) {
          continue;
        }
        if (el.getBoundingClientRect().top <= limit) {
          active = entry.id;
        } else {
          break;
        }
      }
      setActiveId((prev) => (prev === active ? prev : active));
    };
    update();
    globalThis.addEventListener("scroll", update, { passive: true });
    return () => globalThis.removeEventListener("scroll", update);
  }, []);

  return activeId;
}
