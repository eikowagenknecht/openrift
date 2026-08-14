import { Link } from "@tanstack/react-router";

import { CreatorChatSection } from "@/components/creators/creator-chat-section";
import { CreatorSection } from "@/components/creators/creator-section";
import { CreatorStageSection } from "@/components/creators/creator-stage-section";
import type { CreatorTool } from "@/components/creators/creator-tools";
import { visibleCreatorTools } from "@/components/creators/creator-tools";
import {
  PageDescription,
  PageTopBar,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { Button } from "@/components/ui/button";
import { CardLink } from "@/components/ui/card-link";
import { IconChip } from "@/components/ui/icon-chip";
import { useFeatureEnabled } from "@/hooks/use-feature-flags";
import { cn, PAGE_PADDING_NO_TOP } from "@/lib/utils";

/**
 * A tool's tile. Jumps to the tool's own section rather than to the tool
 * itself: everything on this page needs a paragraph of setup before the link
 * is any use, and the sections are where that lives.
 *
 * @returns The tile.
 */
function CreatorToolTile({ tool }: { tool: CreatorTool }) {
  return (
    <CardLink href={`#${tool.id}`} size="sm" className="gap-2">
      <div className="flex flex-col gap-1.5 px-3">
        <div className="flex items-center gap-2.5">
          <IconChip icon={tool.icon} tone={tool.tone} size="sm" />
          <span className="font-heading font-medium">{tool.title}</span>
        </div>
        <p className="text-muted-foreground">{tool.blurb}</p>
      </div>
    </CardLink>
  );
}

/**
 * The front door for video creators and streamers: what OpenRift offers them,
 * and how to set each piece up.
 *
 * Tiles up top answer "what is here" in one screen, since most visits are a
 * first visit by someone following a link in a video description. Each tool's
 * setup then gets its own section below.
 *
 * Every flag-gated tool drops out of both the grid and the body while its flag
 * is off, so the page never sends anyone at a route that redirects.
 *
 * @returns The creators page.
 */
export function CreatorsPage() {
  const tierListsEnabled = useFeatureEnabled("tier-lists");
  const overlayEnabled = useFeatureEnabled("overlay");

  const tools = visibleCreatorTools({
    "tier-lists": tierListsEnabled,
    overlay: overlayEnabled,
  });

  return (
    <>
      <PageTopBarSticky maxWidth="3xl">
        <PageTopBar>
          <PageTopBarTitle>For creators</PageTopBarTitle>
        </PageTopBar>
      </PageTopBarSticky>

      <div
        className={cn(
          "mx-auto flex w-full max-w-3xl flex-col gap-10 pt-3 pb-16",
          PAGE_PADDING_NO_TOP,
        )}
      >
        <div className="flex flex-col gap-5">
          <PageDescription>
            A handful of things here are built for people making Riftbound videos and streams: card
            lookups your chat can run, tier lists you can share, and ways to get card art on screen
            without your audience watching you scroll a website. All of it is free, and none of it
            needs anything installed.
          </PageDescription>

          <div className="grid gap-3 sm:grid-cols-2">
            {tools.map((tool) => (
              <CreatorToolTile key={tool.id} tool={tool} />
            ))}
          </div>
        </div>

        <CreatorChatSection />

        {tierListsEnabled && (
          <CreatorSection id="tier-lists" title="Tier lists">
            <p>
              Rank a set from S down to D on a board you build by dragging cards out of the card
              pool. When it looks right, share it as a link, or take the image straight into a
              thumbnail or a video.
            </p>
            <p>
              The share link works for anyone, signed in or not, and unfurls with the board as its
              preview image. On a phone the dragging gives way to a tier picker, so you can put a
              list together away from a desk.
            </p>
            <div>
              <Button variant="outline" render={<Link to="/tier-lists" />}>
                Open the tier list maker
              </Button>
            </div>
          </CreatorSection>
        )}

        {overlayEnabled && <CreatorStageSection />}

        <CreatorSection id="segments" title="Segment material">
          <p>
            Two more things worth knowing about, less as tools to set up than as something to build
            a segment around.
          </p>
          <p>
            The <Link to="/pack-opener">pack opener</Link> opens virtual boosters at the real
            published pull rates, which is a cheap way to run a box break bit without a box. The{" "}
            <Link to="/card-designer">card designer</Link> makes a custom card in the Riftbound
            frame, for a joke card, a channel mascot, or a giveaway graphic.
          </p>
        </CreatorSection>

        <CreatorSection id="catalogue" title="About the card data">
          <p>
            The catalogue behind all of this is kept up to date by one person, so a brand new set
            can take a few days to fill in, and the odd printing goes missing. If a lookup comes
            back empty for a card you know exists, <Link to="/contribute">tell me about it</Link>{" "}
            and it gets fixed.
          </p>
          <p className="text-muted-foreground">
            If any of this ends up in a video, a link back is always appreciated, never required.
          </p>
        </CreatorSection>
      </div>
    </>
  );
}
