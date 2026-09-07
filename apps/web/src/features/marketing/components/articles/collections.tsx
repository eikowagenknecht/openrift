import {
  ArrowRightLeftIcon,
  BookOpenIcon,
  GripVerticalIcon,
  InboxIcon,
  KeyboardIcon,
  ListChecksIcon,
  MousePointerClickIcon,
  PackageIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react";

import { Heading } from "@/components/heading";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Callout } from "@/components/ui/callout";
import { FeatureCard } from "@/features/marketing/components/article-cards";
import { cn } from "@/lib/utils";

export default function CollectionsArticle() {
  return (
    <div className="space-y-8">
      <p className="text-muted-foreground">
        A collection is where your cards physically live. Think of it as a real-world location:{" "}
        &quot;Red Deck Box&quot;, &quot;Binder 1&quot;, &quot;Main Storage Box&quot;, or even
        &quot;Lent to Sebastian&quot;. Every copy in your collection lives in exactly one place.
      </p>

      <Callout>
        <div className="flex flex-col gap-3 text-sm sm:flex-row">
          <div className="bg-background flex flex-col gap-1.5 rounded-lg border p-3 sm:w-48">
            <span className="text-muted-foreground text-2xs mb-1 font-medium tracking-wide uppercase">
              Collections
            </span>
            <SidebarItem icon={<PackageIcon className="size-3.5" />} label="All Cards" count={94} />
            <SidebarItem
              icon={<InboxIcon className="size-3.5" />}
              label="Inbox"
              count={12}
              active
            />
            <SidebarItem
              icon={<BookOpenIcon className="size-3.5" />}
              label="Red Deck Box"
              count={40}
            />
            <SidebarItem icon={<BookOpenIcon className="size-3.5" />} label="Binder 1" count={31} />
            <SidebarItem
              icon={<BookOpenIcon className="size-3.5" />}
              label="Lent to Sebastian"
              count={11}
            />
            <div className="border-border mt-1 border-t pt-1">
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <PlusIcon className="size-3" /> New collection
              </span>
            </div>
          </div>

          <div className="flex flex-1 flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="bg-muted flex-1 rounded-md px-2 py-1 text-xs">
                <SearchIcon className="text-muted-foreground mr-1 inline size-3" />
                <span className="text-muted-foreground">Search cards&hellip;</span>
              </div>
              <div className="bg-primary/10 text-primary text-2xs rounded-md px-2 py-0.5 font-medium">
                12 cards
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {Array.from({ length: 8 }, (_, index) => (
                <div key={index} className="bg-muted aspect-card rounded-md" />
              ))}
            </div>
          </div>
        </div>
      </Callout>

      <section>
        <Heading className="mb-2">Collections as physical locations</Heading>
        <p className="text-muted-foreground">
          Collections mirror where your cards actually are in the real world. Moving a copy from
          &quot;Inbox&quot; to &quot;Red Deck Box&quot; records that you physically put that card in
          that box.
        </p>
        <p className="text-muted-foreground mt-2">
          Collections track <strong className="text-foreground">copies</strong> (specific physical
          cards), not the cards as game concepts. If you own three copies of the same card, each one
          lives in a collection, whether that&apos;s the same collection or different ones. See{" "}
          <a href="/help/cards-printings-copies" className="text-primary hover:underline">
            Cards, Printings &amp; Copies
          </a>{" "}
          for more on how these relate.
        </p>
      </section>

      <section>
        <Heading id="deck-building-availability" className="mb-2">
          Deck building availability
        </Heading>
        <Alert>
          <ShieldCheckIcon className="text-primary" />
          <AlertDescription>
            <p>
              Each collection has an &quot;available for deck building&quot; toggle. Open a
              collection, hit the three-dot menu, and pick <em>Edit collection</em> to change it.
              When turned off, copies in that collection don&apos;t count toward owned cards in the
              deck builder or the shopping list.
            </p>
            <p>
              This is useful for cards you don&apos;t want to cannibalise: a high-value card you
              keep in a display case, cards lent to a friend, or copies already committed to a
              specific deck. Locked-away copies still show up in the deck builder&apos;s ownership
              panel as &quot;locked&quot;, so you can see what you&apos;d have available if you
              turned the collection back on.
            </p>
          </AlertDescription>
        </Alert>
      </section>

      <section>
        <Heading className="mb-2">Getting started</Heading>
        <p className="text-muted-foreground">
          Open <strong className="text-foreground">Collections</strong> from the top navigation.
          Your first collection is the <strong className="text-foreground">Inbox</strong>, which is
          always present. It&apos;s where quick-added cards land unless you choose a different
          target.
        </p>
        <p className="text-muted-foreground mt-2">
          To create a new collection, click{" "}
          <strong className="text-foreground">New collection</strong> in the sidebar, type a name,
          and press Enter. Name it after the real-world location where you keep those cards.
        </p>
      </section>

      <section>
        <Heading className="mb-2">Adding cards</Heading>
        <p className="text-muted-foreground">There are a few ways to add cards to a collection:</p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FeatureCard
            icon={<SearchIcon className="size-4" />}
            title="Quick add"
            shortcut="Ctrl+K"
            description="A fast search palette. Type a card name, use arrow keys to navigate, and press Enter to add. Shift+Enter to undo."
          />
          <FeatureCard
            icon={<MousePointerClickIcon className="size-4" />}
            title="Browse & add"
            description="Browse the full catalog with all filters available. Click the plus button on any card to add it. A pulsing red dot shows you're in add mode."
          />
          <FeatureCard
            icon={<KeyboardIcon className="size-4" />}
            title="Add several at once"
            shortcut="1-9"
            description="Click a card in the grid to select it, then press a number key to add that many copies in one press. Plus and minus add or remove one."
          />
        </div>

        <p className="text-muted-foreground mt-3">
          Both modes track what you&apos;ve added during the session. Click{" "}
          <strong className="text-foreground">Done</strong> when you&apos;re finished.
        </p>
      </section>

      <section>
        <Heading className="mb-2">Organizing your cards</Heading>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FeatureCard
            icon={<GripVerticalIcon className="size-4" />}
            title="Drag & drop"
            description="Drag cards from the grid onto a collection or a list in the sidebar. A blue ring highlights the target. One copy comes along by default: hold a number key while dragging to bring that many, or Shift for the whole stack."
          />
          <FeatureCard
            icon={<ListChecksIcon className="size-4" />}
            title="Bulk select"
            description="Click the checkbox icon in the toolbar, or Ctrl-click any card to start selecting. A floating action bar appears at the bottom."
          />
          <FeatureCard
            icon={<ArrowRightLeftIcon className="size-4" />}
            title="Move"
            description="Select cards, then click Move. Pick the target collection from the dialog and confirm. Each copy belongs to exactly one collection, so moving it removes it from the source."
          />
          <FeatureCard
            icon={<Trash2Icon className="size-4" />}
            title="Dispose"
            description="Select cards, then click Dispose to permanently remove them. The removal is recorded in your activity history."
          />
        </div>
      </section>

      <section>
        <Heading className="mb-2">View modes in collections</Heading>
        <p className="text-muted-foreground">
          Collections support the same three view modes as the card browser. You can also filter,
          sort, and group cards inside any collection just like in the catalog.
        </p>
        <div className="divide-border mt-3 divide-y rounded-lg border text-sm">
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
            description="Every individual copy on the grid, no stacking. Useful for managing specific copies."
          />
        </div>
      </section>

      <section>
        <Heading className="mb-2">The sidebar</Heading>
        <p className="text-muted-foreground">
          The sidebar lists all your collections with a copy count badge. At the top,{" "}
          <strong className="text-foreground">All Cards</strong> shows everything you own across all
          collections in one view, including your total collection value from your preferred
          marketplace. Below your collections are links to{" "}
          <strong className="text-foreground">Import / Export</strong> and{" "}
          <strong className="text-foreground">Activity</strong> (a log of all additions, moves, and
          removals).
        </p>
        <p className="text-muted-foreground mt-2">
          Right-click a collection or a list for its actions: rename, share, delete, and{" "}
          <strong className="text-foreground">Hide behind Show more</strong>. Hidden entries move
          behind a <strong className="text-foreground">Show more</strong> toggle at the foot of
          their section, which keeps a long sidebar down to what you actually use. On a phone, press
          and hold instead of right-clicking.
        </p>
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
        "flex items-center gap-2 rounded-md px-2 py-1 text-xs",
        active ? "bg-primary/10 text-primary font-medium" : "text-foreground",
      )}
    >
      {icon}
      <span className="flex-1 truncate">{label}</span>
      <span
        className={cn(
          "text-2xs rounded-full px-1.5 tabular-nums",
          active ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        {count}
      </span>
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
