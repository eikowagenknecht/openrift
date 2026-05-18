import { ListIcon } from "lucide-react";
import type { MouseEvent } from "react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { usePageTocStore } from "@/stores/page-toc-store";

export interface PageTocItem {
  id: string;
  label: string;
  level?: number;
}

// Per-link store subscription: scroll-driven `activeId` changes only re-render
// the previously-active and newly-active links instead of the whole TOC.
function TocLink({
  id,
  label,
  level,
  onSelect,
}: {
  id: string;
  label: string;
  level: number;
  onSelect?: () => void;
}) {
  const isActive = usePageTocStore((state) => state.activeId === id);
  const setActiveId = usePageTocStore((state) => state.setActiveId);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    const element = document.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
    if (element) {
      event.preventDefault();
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveId(id);
    }
    onSelect?.();
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

// Reset to the first item whenever the items list changes (page navigation).
// The store is global, so without this it would keep a stale id from the
// previous page until the observer fires.
function useActiveTocItem(items: PageTocItem[]) {
  const setActiveId = usePageTocStore((state) => state.setActiveId);

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
}

export function PageToc({ items, className }: { items: PageTocItem[]; className?: string }) {
  useActiveTocItem(items);

  return (
    <aside
      className={cn(
        "sticky top-(--sticky-top) hidden max-h-[calc(100vh-var(--sticky-top))] w-48 shrink-0 lg:block",
        className,
      )}
    >
      <ScrollArea className="h-full">
        <nav className="space-y-0.5">
          {items.map((item) => (
            <TocLink key={item.id} id={item.id} label={item.label} level={item.level ?? 0} />
          ))}
        </nav>
      </ScrollArea>
    </aside>
  );
}

// Mobile counterpart to PageToc. Below the lg breakpoint the sidebar is hidden,
// so this opens a bottom sheet with the same list. Pair with PageToc on the
// same page, whose observer keeps activeId in sync.
export function PageTocMobileTrigger({
  items,
  className,
}: {
  items: PageTocItem[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) {
    return null;
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Open contents"
            className={cn("lg:hidden", className)}
          />
        }
      >
        <ListIcon />
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[80vh]">
        <SheetHeader>
          <SheetTitle>Contents</SheetTitle>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1">
          <nav className="space-y-0.5 px-4 pb-6">
            {items.map((item) => (
              <TocLink
                key={item.id}
                id={item.id}
                label={item.label}
                level={item.level ?? 0}
                onSelect={() => setOpen(false)}
              />
            ))}
          </nav>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
