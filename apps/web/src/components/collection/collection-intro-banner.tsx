import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import {
  CheckSquareIcon,
  CopyIcon,
  FunnelIcon,
  InfoIcon,
  LayoutGridIcon,
  LibraryBigIcon,
  Rows3Icon,
  SlidersHorizontalIcon,
  SquareIcon,
  SquareStackIcon,
  XIcon,
} from "lucide-react";

import { Kbd } from "@/components/ui/kbd";
import { useDisplayStore } from "@/stores/display-store";

interface ToolbarGuideRow {
  icons: readonly LucideIcon[];
  title: string;
  description: string;
  /** Rendered only on `sm`+ — the control sits in the mobile options drawer on phones. */
  desktopOnly?: boolean;
}

const LIBRARY_ROW: ToolbarGuideRow = {
  icons: [LibraryBigIcon],
  title: "Library",
  description: "Switch between the whole card library and just the cards you own.",
};

const VIEWS_ROW: ToolbarGuideRow = {
  icons: [SquareIcon, CopyIcon, SquareStackIcon],
  title: "Cards, printings, copies",
  description: "One tile per card, every printing separately, or each individual copy you own.",
  desktopOnly: true,
};

// Only meaningful with the full filter panel: the funnel button doesn't exist
// with compact filters (the default), where the chip bar is always visible.
const FILTERS_ROW: ToolbarGuideRow = {
  icons: [FunnelIcon],
  title: "Filters",
  description: "Narrow the grid by domain, set, rarity, language, and more.",
  desktopOnly: true,
};

const MANAGE_ROW: ToolbarGuideRow = {
  icons: [CheckSquareIcon],
  title: "Manage cards",
  description:
    "Select lots of cards at once to move them between collections or add them to lists.",
};

const DISPLAY_ROW: ToolbarGuideRow = {
  icons: [LayoutGridIcon, Rows3Icon],
  title: "Grid or table",
  description: "View cards as image tiles or as a compact table.",
  desktopOnly: true,
};

/**
 * First-visit guide shown above the collection grid while the collection is
 * empty. Explains the toolbar controls (library toggle, view modes, filters)
 * and how to add the first cards. Dismissal persists via the onboarding store.
 *
 * @returns The dismissible intro banner.
 */
export function CollectionIntroBanner({
  showLibrary,
  onDismiss,
}: {
  showLibrary: boolean;
  onDismiss: () => void;
}) {
  // With compact filters (the default) there is no funnel button to explain,
  // so the Filters row gives way to the Manage-cards tip.
  const compactFilterView = useDisplayStore((state) => state.compactFilterView);
  const guideRows = [
    LIBRARY_ROW,
    VIEWS_ROW,
    compactFilterView ? MANAGE_ROW : FILTERS_ROW,
    DISPLAY_ROW,
  ];
  return (
    <div className="border-border bg-muted/30 relative mb-3 rounded-lg border p-4">
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss this guide"
        className="text-muted-foreground hover:text-foreground absolute top-2 right-2 rounded p-1"
      >
        <XIcon className="size-4" />
      </button>
      <div className="flex gap-3 pr-6">
        <InfoIcon className="text-primary mt-0.5 size-5 shrink-0" />
        <div className="flex flex-col gap-3">
          <div>
            <p className="font-medium">Welcome to your collection</p>
            <p className="text-muted-foreground mt-0.5">
              {showLibrary
                ? "You're browsing the whole card library. Tap the + on any card to add it to your collection."
                : "This view shows only the cards you own. Turn on the library to browse and add every card."}
            </p>
          </div>
          <ul className="grid gap-2 @lg:grid-cols-2">
            {guideRows.map((row) => (
              <li
                key={row.title}
                className={
                  row.desktopOnly ? "hidden items-start gap-2 sm:flex" : "flex items-start gap-2"
                }
              >
                <GuideIcons icons={row.icons} />
                <div>
                  <span className="font-medium">{row.title}</span>
                  <p className="text-muted-foreground">{row.description}</p>
                </div>
              </li>
            ))}
            <li className="flex items-start gap-2 sm:hidden">
              <GuideIcons icons={[SlidersHorizontalIcon]} />
              <div>
                <span className="font-medium">Options</span>
                <p className="text-muted-foreground">
                  View modes, sorting, and filters live behind this button.
                </p>
              </div>
            </li>
          </ul>
          <p className="text-muted-foreground">
            <span className="hidden sm:inline">
              Prefer typing? Press <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd> to quick-add cards by name.{" "}
            </span>
            Coming from another tool?{" "}
            <Link to="/collections/import" className="text-primary hover:underline">
              Import your collection
            </Link>
            .{" "}
            <Link
              to="/help/$slug"
              params={{ slug: "cards-printings-copies" }}
              className="text-primary hover:underline"
            >
              Learn how cards, printings &amp; copies work →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Small framed icon squares mirroring how the controls look in the toolbar.
 *
 * @returns The icon row for a guide entry.
 */
function GuideIcons({ icons }: { icons: readonly LucideIcon[] }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {icons.map((Icon, index) => (
        // oxlint-disable-next-line react/no-array-index-key -- static icon list, never reordered
        <span
          key={index}
          className="border-border bg-background flex size-6 items-center justify-center rounded-md border"
        >
          <Icon className="size-3.5" />
        </span>
      ))}
    </span>
  );
}
