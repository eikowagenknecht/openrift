import { ListIcon } from "lucide-react";
import type { MouseEvent } from "react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { usePageTocStore } from "@/stores/page-toc-store";

export interface PageTocItem {
  id: string;
  label: string;
  level?: number;
}

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

// The store is global, so reset activeId on items change or it keeps a stale
// id from the previous page until the observer fires.
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

// Pair with PageToc on the same page: this drawer shares its list but relies
// on PageToc's observer to keep activeId in sync.
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
    <Drawer open={open} onOpenChange={setOpen} showSwipeHandle>
      <DrawerTrigger
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
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Contents</DrawerTitle>
          <DrawerDescription className="sr-only">Jump to a section on this page</DrawerDescription>
        </DrawerHeader>
        {/* Native overflow scroll, not ScrollArea: the Drawer's touch handling
            doesn't recognize ScrollArea's custom overflow:scroll viewport. */}
        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-4 pb-6">
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
      </DrawerContent>
    </Drawer>
  );
}
