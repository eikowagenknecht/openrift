import { Link } from "@tanstack/react-router";
import {
  GripVerticalIcon,
  ImageDownIcon,
  Link2Icon,
  ListOrderedIcon,
  MonitorPlayIcon,
  PencilIcon,
} from "lucide-react";

import { Heading } from "@/components/heading";
import { FeatureCard } from "@/features/marketing/components/article-cards";

export default function TierListsArticle() {
  return (
    <div className="space-y-8">
      <p className="text-muted-foreground">
        A tier list stacks cards into rows you name yourself. Drag cards out of the catalog onto a
        row, rearrange until the board looks right, then share it as a link, download it as an image
        for a thumbnail, or put it on stream and rank live.
      </p>
      <p>
        <Link to="/tier-lists" className="text-primary font-medium hover:underline">
          Open the tier list maker
        </Link>
      </p>

      <section>
        <Heading className="mb-2">Build the board</Heading>
        <p className="text-muted-foreground">
          A new list opens on an empty board with five rows, S to D, purely as a starting point. The
          card pool beside it is the full catalog with the whole filter bar, so narrowing to one
          set, or to Legends, is a filter like any other.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FeatureCard
            icon={<GripVerticalIcon className="size-4" />}
            title="Drag cards onto a tier"
            description="Drag from the pool onto a row, and between rows to re-rank. Cards can be reordered within a row too, so the left end of a tier can mean the strongest."
          />
          <FeatureCard
            icon={<PencilIcon className="size-4" />}
            title="Rename and reorder tiers"
            description="Rows are not fixed to S through D. Rename them, move them, add rows, or remove ones you don't need."
          />
        </div>
      </section>

      <section>
        <Heading className="mb-2">Save, share, and export</Heading>
        <p className="text-muted-foreground">
          The board is only stored when you press Save, and an unsaved board shows an{" "}
          <span className="font-medium">Unsaved changes</span> badge next to the title. Sharing is
          opt-in: until you turn it on, the list has no share link at all.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FeatureCard
            icon={<Link2Icon className="size-4" />}
            title="Share link"
            description="Turn sharing on and the list gets a link anyone can open, no account needed. Pasting it into a video description, Discord, or a chat shows a preview image of the board."
          />
          <FeatureCard
            icon={<ImageDownIcon className="size-4" />}
            title="Download as an image"
            description="The same board as a picture, for a thumbnail or a slide. It is drawn from the saved version, so save before you download."
          />
        </div>
      </section>

      <section>
        <Heading className="mb-2">Put it on stream</Heading>
        <p className="text-muted-foreground">
          Both routes onto the Stage read the saved board, so they stay disabled while a draft is
          unsaved.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FeatureCard
            icon={<MonitorPlayIcon className="size-4" />}
            title="Present"
            description="Opens the finished board on the Stage, ready for a full-screen show or the OBS overlay."
          />
          <FeatureCard
            icon={<ListOrderedIcon className="size-4" />}
            title="Rank live on stage"
            description="Starts from an empty board and fills it in as you talk through it, with the overlay updating for viewers as each card lands."
          />
        </div>
        <p className="text-muted-foreground mt-3">
          Setting up the browser source is covered in{" "}
          <Link
            to="/help/$slug"
            params={{ slug: "stage" }}
            className="text-primary hover:underline"
          >
            Stage &amp; OBS Overlay
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
