import {
  ArrowRightLeft,
  BookOpen,
  GripVertical,
  Inbox,
  ListChecks,
  MousePointerClick,
  Package,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { Kbd } from "@/components/ui/kbd";

export default function CollectionsArticle() {
  return (
    <div className="space-y-8">
      <p className="text-muted-foreground">
        Collections let you organize the cards you own. You can create as many collections as you
        like &mdash; for example, one per deck, one for trades, and one for everything else.
      </p>

      {/* Overview diagram */}
      <div className="border-border bg-muted/30 rounded-lg border p-4">
        <div className="flex flex-col gap-3 text-sm sm:flex-row">
          {/* Sidebar mock */}
          <div className="bg-background border-border flex flex-col gap-1.5 rounded-lg border p-3 sm:w-48">
            <span className="text-muted-foreground mb-1 text-[11px] font-medium tracking-wider uppercase">
              Collections
            </span>
            <SidebarItem icon={<Package className="size-3.5" />} label="All Cards" count={47} />
            <SidebarItem icon={<Inbox className="size-3.5" />} label="Inbox" count={12} active />
            <SidebarItem
              icon={<BookOpen className="size-3.5" />}
              label="Fury Aggro Deck"
              count={24}
            />
            <SidebarItem icon={<BookOpen className="size-3.5" />} label="Trade Binder" count={11} />
            <div className="border-border mt-1 border-t pt-1">
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <Plus className="size-3" /> New collection
              </span>
            </div>
          </div>

          {/* Grid mock */}
          <div className="flex flex-1 flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="bg-muted flex-1 rounded px-2 py-1 text-xs">
                <Search className="text-muted-foreground mr-1 inline size-3" />
                <span className="text-muted-foreground">Search cards&hellip;</span>
              </div>
              <div className="bg-primary/10 text-primary rounded px-2 py-0.5 text-[11px] font-medium">
                12 cards
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {Array.from({ length: 8 }, (_, index) => (
                <div key={index} className="bg-muted/60 aspect-[5/7] rounded" />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Getting started */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Getting started</h2>
        <p className="text-muted-foreground">
          Open <strong className="text-foreground">Collections</strong> from the top navigation.
          Your first collection is the <strong className="text-foreground">Inbox</strong> &mdash; a
          default collection that&apos;s always there. It&apos;s where quick-added cards land unless
          you choose a different target.
        </p>
        <p className="text-muted-foreground mt-2">
          To create a new collection, click{" "}
          <strong className="text-foreground">New collection</strong> in the sidebar, type a name,
          and press Enter. Collections appear in the sidebar where you can switch between them.
        </p>
      </section>

      {/* Adding cards */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Adding cards</h2>
        <p className="text-muted-foreground">There are two ways to add cards to a collection:</p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FeatureCard
            icon={<Search className="size-4" />}
            title="Quick add"
            shortcut="Ctrl+K"
            description="A fast search palette. Type a card name, use arrow keys to navigate, and press Enter to add. Use Shift+Enter to undo."
          />
          <FeatureCard
            icon={<MousePointerClick className="size-4" />}
            title="Browse & add"
            description="Browse the full catalog with all filters available. Click the plus button on any card to add it. A pulsing red dot shows you're in add mode."
          />
        </div>

        <p className="text-muted-foreground mt-3">
          Both modes track what you&apos;ve added during the session. Click{" "}
          <strong className="text-foreground">Done</strong> when you&apos;re finished.
        </p>
      </section>

      {/* Organizing */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Organizing your cards</h2>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FeatureCard
            icon={<GripVertical className="size-4" />}
            title="Drag & drop"
            description="Drag cards from the grid and drop them on a collection in the sidebar. A blue ring highlights the target collection."
          />
          <FeatureCard
            icon={<ListChecks className="size-4" />}
            title="Bulk select"
            description="Click the checkbox icon in the toolbar, or Ctrl-click any card to start selecting. A floating action bar appears at the bottom."
          />
          <FeatureCard
            icon={<ArrowRightLeft className="size-4" />}
            title="Move"
            description="Select cards, then click Move. Pick the target collection from the dialog and confirm."
          />
          <FeatureCard
            icon={<Trash2 className="size-4" />}
            title="Dispose"
            description="Select cards, then click Dispose to permanently remove them. The removal is recorded in your activity history."
          />
        </div>
      </section>

      {/* View modes */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">View modes in collections</h2>
        <p className="text-muted-foreground">
          Collections support the same three view modes as the card browser:
        </p>
        <div className="border-border divide-border mt-3 divide-y rounded-lg border text-sm">
          <ViewModeRow
            mode="Cards"
            description="One entry per unique card. Owned count sums across all printings of that card."
          />
          <ViewModeRow
            mode="Printings"
            description="One entry per printing. See exactly which versions you own."
          />
          <ViewModeRow
            mode="Copies"
            description="Every individual copy on the grid — no stacking. Useful for managing specific copies."
          />
        </div>
      </section>

      {/* Sidebar info */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">The sidebar</h2>
        <p className="text-muted-foreground">
          The sidebar lists all your collections with a copy count badge. At the top,{" "}
          <strong className="text-foreground">All Cards</strong> shows everything you own across all
          collections in one view. Below your collections, you&apos;ll find links to{" "}
          <strong className="text-foreground">Import / Export</strong> and{" "}
          <strong className="text-foreground">Activity</strong> (a log of all additions, moves, and
          removals).
        </p>
      </section>

      {/* Tips */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Tips</h2>
        <ul className="text-muted-foreground list-inside list-disc space-y-1">
          <li>
            You can filter, sort, and group cards inside any collection just like in the catalog
            browser.
          </li>
          <li>
            Each copy belongs to exactly one collection. Moving it removes it from the source.
          </li>
          <li>
            The <strong className="text-foreground">All Cards</strong> view shows your total
            collection value from your preferred marketplace.
          </li>
          <li>
            Use the <strong className="text-foreground">Copies</strong> view mode when you need to
            manage individual cards &mdash; for example, to dispose of a specific copy.
          </li>
        </ul>
      </section>
    </div>
  );
}

function SidebarItem({
  icon,
  label,
  count,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded px-2 py-1 text-xs",
        active ? "bg-primary/10 text-primary font-medium" : "text-foreground",
      )}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      <span
        className={cn(
          "rounded-full px-1.5 text-[10px] tabular-nums",
          active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
    </div>
  );
}

function cn(...classes: (string | false | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

function FeatureCard({
  icon,
  title,
  shortcut,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  shortcut?: string;
  description: string;
}) {
  return (
    <div className="border-border bg-background rounded-lg border p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        <span className="text-sm font-medium">{title}</span>
        {shortcut && <Kbd className="px-1.5">{shortcut}</Kbd>}
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">{description}</p>
    </div>
  );
}

function ViewModeRow({ mode, description }: { mode: string; description: string }) {
  return (
    <div className="flex gap-3 px-3 py-2.5">
      <span className="w-20 shrink-0 font-medium">{mode}</span>
      <span className="text-muted-foreground">{description}</span>
    </div>
  );
}
