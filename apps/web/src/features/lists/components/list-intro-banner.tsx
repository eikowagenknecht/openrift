import type { ListIntent, ListKind } from "@openrift/shared/types/api/list";
import { Link } from "@tanstack/react-router";
import {
  CheckSquareIcon,
  FolderInputIcon,
  LibraryBigIcon,
  Share2Icon,
  SparklesIcon,
  TagIcon,
} from "lucide-react";

import type { IntroGuideRow } from "@/components/intro-banner";
import { IntroBanner, IntroGuideList } from "@/components/intro-banner";

const FROM_LIBRARY: IntroGuideRow = {
  icons: [LibraryBigIcon],
  title: "Fill it from the library",
  description:
    "Turn on the library and press + on any card, or drag cards onto the list in the sidebar.",
};

const FROM_COLLECTION: IntroGuideRow = {
  icons: [CheckSquareIcon],
  title: "Fill it from a collection",
  description:
    "Open a collection, choose Manage cards, select copies, and pick Add to list. Or drag copies onto the list in the sidebar.",
};

const DYNAMIC_RULES: IntroGuideRow = {
  icons: [SparklesIcon],
  title: "Dynamic rules",
  description: "Set a rule once, like every Legend you don't own yet, and the list fills itself.",
};

const TRADE_PREFERENCES: IntroGuideRow = {
  icons: [TagIcon],
  title: "Prices and preferences",
  description:
    "The list's price reference and what you accept are what members see on a match. Override them per card from the pill on each entry.",
};

const SHARE: IntroGuideRow = {
  icons: [Share2Icon],
  title: "Share with a group",
  description:
    "Lists are private until you share them into a group from that group's settings. Each group is shared separately.",
};

const FILE_AWAY: IntroGuideRow = {
  icons: [FolderInputIcon],
  title: "File copies away",
  description:
    "Move every copy on this list into another collection in one step from Manage copies.",
};

function introCopy(
  intent: ListIntent,
  kind: ListKind,
): { title: string; lead: string; rows: readonly IntroGuideRow[] } {
  if (intent === "wish") {
    return {
      title: "This is a wishlist",
      lead: "Cards you're looking for. Share it with a group and OpenRift matches your wants against what other members offer on their tradelists. Entries drop off as you add copies to your collection.",
      rows: [FROM_LIBRARY, DYNAMIC_RULES, TRADE_PREFERENCES, SHARE],
    };
  }
  if (intent === "trade") {
    return {
      title: "This is a tradelist",
      lead: "Specific copies from your collection you'd part with. A copy stays where it is, the list only flags it as available. When it leaves your collection it drops off the list.",
      rows: [FROM_COLLECTION, DYNAMIC_RULES, TRADE_PREFERENCES, SHARE],
    };
  }
  return {
    title: "This is an organize list",
    lead: "A pile for anything that isn't about trading: a brew pool, favourite alt-arts, a bulk box to sort. A group can see it once shared, but it never feeds trade matches.",
    rows:
      kind === "copy"
        ? [FROM_COLLECTION, DYNAMIC_RULES, FILE_AWAY, SHARE]
        : [FROM_LIBRARY, DYNAMIC_RULES, SHARE],
  };
}

export function ListIntroBanner({
  intent,
  kind,
  onDismiss,
}: {
  intent: ListIntent;
  kind: ListKind;
  onDismiss: () => void;
}) {
  const copy = introCopy(intent, kind);
  return (
    <IntroBanner className="mb-3" title={copy.title} lead={copy.lead} onDismiss={onDismiss}>
      <IntroGuideList rows={copy.rows} />
      <Link to="/help/$slug" params={{ slug: "lists" }} className="text-primary hover:underline">
        How wishlists and tradelists work →
      </Link>
    </IntroBanner>
  );
}
