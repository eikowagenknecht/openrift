import type { MouseEvent } from "react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export interface PageTocItem {
  id: string;
  label: string;
  level?: number;
}

export function PageToc({ items, className }: { items: PageTocItem[]; className?: string }) {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);

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
  }, [items]);

  function handleClick(event: MouseEvent<HTMLAnchorElement>, id: string) {
    const element = document.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (element) {
      event.preventDefault();
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveId(id);
    }
  }

  return (
    <aside className={cn("hidden w-48 shrink-0 lg:block", className)}>
      <nav className="sticky top-16 max-h-[calc(100vh-5rem)] space-y-0.5 overflow-y-auto">
        {items.map((item) => {
          const level = item.level ?? 0;
          return (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(event) => handleClick(event, item.id)}
              style={level > 0 ? { paddingLeft: `${level * 0.75}rem` } : undefined}
              className={cn(
                "block truncate text-sm transition-colors",
                activeId === item.id
                  ? "text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </a>
          );
        })}
      </nav>
    </aside>
  );
}
