import type { MouseEvent } from "react";
import { useEffect } from "react";

import { cn } from "@/lib/utils";
import { usePageTocStore } from "@/stores/page-toc-store";

export interface PageTocItem {
  id: string;
  label: string;
  level?: number;
}

// Per-link store subscription: scroll-driven `activeId` changes only re-render
// the previously-active and newly-active links instead of the whole TOC.
function TocLink({ id, label, level }: { id: string; label: string; level: number }) {
  const isActive = usePageTocStore((state) => state.activeId === id);
  const setActiveId = usePageTocStore((state) => state.setActiveId);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    const element = document.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (element) {
      event.preventDefault();
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveId(id);
    }
  }

  return (
    <a
      href={`#${id}`}
      onClick={handleClick}
      style={level > 0 ? { paddingLeft: `${level * 0.75}rem` } : undefined}
      className={cn(
        "block truncate text-sm transition-colors",
        isActive ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </a>
  );
}

export function PageToc({ items, className }: { items: PageTocItem[]; className?: string }) {
  const setActiveId = usePageTocStore((state) => state.setActiveId);

  // Reset to the first item whenever the items list changes (page navigation).
  // The store is global, so without this it would keep a stale id from the
  // previous page until the observer fires.
  useEffect(() => {
    setActiveId(items[0]?.id ?? null);
  }, [items, setActiveId]);

  useEffect(() => {
    if (items.length === 0) {
      return;
    }
    const elements = items
      .map((item) => document.querySelector<HTMLElement>(`#${CSS.escape(item.id)}`))
      .filter((element): element is HTMLElement => element !== null);
    if (elements.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );

    for (const element of elements) {
      observer.observe(element);
    }
    return () => observer.disconnect();
  }, [items, setActiveId]);

  return (
    <aside className={cn("hidden w-48 shrink-0 lg:block", className)}>
      <nav className="sticky top-(--sticky-top) max-h-[calc(100vh-var(--sticky-top))] space-y-0.5 overflow-y-auto">
        {items.map((item) => (
          <TocLink key={item.id} id={item.id} label={item.label} level={item.level ?? 0} />
        ))}
      </nav>
    </aside>
  );
}
