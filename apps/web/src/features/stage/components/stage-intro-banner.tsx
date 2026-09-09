import { Link } from "@tanstack/react-router";
import { KeyboardIcon, ListPlusIcon, MonitorIcon, RadioTowerIcon } from "lucide-react";

import type { IntroGuideRow } from "@/components/intro-banner";
import { IntroBanner, IntroGuideList } from "@/components/intro-banner";
import { Kbd } from "@/components/ui/kbd";

const GUIDE_ROWS: readonly IntroGuideRow[] = [
  {
    icons: [ListPlusIcon],
    title: "Build the queue",
    description:
      "Press + on any card in the browser, drag it into the queue, or fill the queue from a deck or a list.",
  },
  {
    icons: [MonitorIcon],
    title: "This screen",
    description:
      "A full-screen show with nothing of the site around it. Capture this window in your streaming software.",
  },
  {
    icons: [RadioTowerIcon],
    title: "OBS overlay",
    description:
      "Sign in, paste your browser source link into OBS, and push cards to it from here or from your phone.",
  },
  {
    icons: [KeyboardIcon],
    title: "Keys in the show",
    description: (
      <>
        Arrows step through the queue, <Kbd>P</Kbd> pushes a card to the overlay, <Kbd>?</Kbd> lists
        every key.
      </>
    ),
    desktopOnly: true,
  },
];

export function StageIntroBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <IntroBanner
      title="Put cards in front of an audience"
      lead="Queue up cards, then show them one at a time: full screen on this display, or as a transparent overlay inside OBS. Both outputs read the same queue."
      onDismiss={onDismiss}
    >
      <IntroGuideList rows={GUIDE_ROWS} />
      <Link to="/help/$slug" params={{ slug: "stage" }} className="text-primary hover:underline">
        Read the full guide →
      </Link>
    </IntroBanner>
  );
}
