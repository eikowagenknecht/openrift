import { Link } from "@tanstack/react-router";
import { GripVerticalIcon, MonitorPlayIcon, PencilIcon, PointerIcon, SaveIcon } from "lucide-react";

import type { IntroGuideRow } from "@/components/intro-banner";
import { IntroBanner, IntroGuideList } from "@/components/intro-banner";

const GUIDE_ROWS: readonly IntroGuideRow[] = [
  {
    icons: [GripVerticalIcon],
    title: "Drag to rank",
    description:
      "Drag a card from the pool onto a row, and between rows to re-rank. Order within a row counts too.",
    desktopOnly: true,
  },
  {
    icons: [PointerIcon],
    title: "Tap to rank",
    description: "Tap a card in the pool and pick its tier.",
    mobileOnly: true,
  },
  {
    icons: [PencilIcon],
    title: "Your rows, your names",
    description: "Rename, reorder, add or remove rows. S to D is only a starting point.",
  },
  {
    icons: [SaveIcon],
    title: "Save before you share",
    description:
      "Share links, the image download, and the stage all read the saved board, so save first.",
  },
  {
    icons: [MonitorPlayIcon],
    title: "Take it on stream",
    description:
      "Present the finished board on the Stage, or rank it live while the overlay fills in for viewers.",
  },
];

export function TierListIntroBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <IntroBanner
      title="Rank cards on your board"
      lead="The pool beside the board is the whole catalog with the usual filters, so narrowing it to one set or just Legends is a filter like any other."
      onDismiss={onDismiss}
    >
      <IntroGuideList rows={GUIDE_ROWS} />
      <Link
        to="/help/$slug"
        params={{ slug: "tier-lists" }}
        className="text-primary hover:underline"
      >
        Read the full guide →
      </Link>
    </IntroBanner>
  );
}
