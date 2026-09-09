import { Link } from "@tanstack/react-router";
import {
  CheckSquareIcon,
  CopyIcon,
  LayoutGridIcon,
  LibraryBigIcon,
  Rows3Icon,
  SlidersHorizontalIcon,
  SquareIcon,
  SquareStackIcon,
} from "lucide-react";

import type { IntroGuideRow } from "@/components/intro-banner";
import { IntroBanner, IntroGuideList } from "@/components/intro-banner";
import { Kbd } from "@/components/ui/kbd";

const GUIDE_ROWS: readonly IntroGuideRow[] = [
  {
    icons: [LibraryBigIcon],
    title: "Library",
    description: "Switch between the whole card library and just the cards you own.",
  },
  {
    icons: [SquareIcon, CopyIcon, SquareStackIcon],
    title: "Cards, printings, copies",
    description: "One tile per card, every printing separately, or each individual copy you own.",
    desktopOnly: true,
  },
  {
    icons: [CheckSquareIcon],
    title: "Manage cards",
    description:
      "Select lots of cards at once to move them between collections or add them to lists.",
  },
  {
    icons: [LayoutGridIcon, Rows3Icon],
    title: "Grid or table",
    description: "View cards as image tiles or as a compact table.",
    desktopOnly: true,
  },
  {
    icons: [SlidersHorizontalIcon],
    title: "Options",
    description: "View modes, sorting, and filters live behind this button.",
    mobileOnly: true,
  },
];

export function CollectionIntroBanner({
  showLibrary,
  onDismiss,
}: {
  showLibrary: boolean;
  onDismiss: () => void;
}) {
  return (
    <IntroBanner
      className="mb-3"
      title="Welcome to your collection"
      lead={
        showLibrary
          ? "You're browsing the whole card library. Tap the + on any card to add it to your collection."
          : "This view shows only the cards you own. Turn on the library to browse and add every card."
      }
      onDismiss={onDismiss}
    >
      <IntroGuideList rows={GUIDE_ROWS} />
      <p className="text-muted-foreground">
        <span className="hidden sm:inline">
          <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd> quick-add ·{" "}
        </span>
        <Link to="/collections/import" className="text-primary hover:underline">
          Import your collection
        </Link>{" "}
        ·{" "}
        <Link
          to="/help/$slug"
          params={{ slug: "cards-printings-copies" }}
          className="text-primary hover:underline"
        >
          How cards, printings &amp; copies work
        </Link>
      </p>
    </IntroBanner>
  );
}
