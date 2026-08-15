import { Link } from "@tanstack/react-router";

import { CreatorChatSection } from "@/components/creators/creator-chat-section";
import { CreatorSection } from "@/components/creators/creator-section";
import { CreatorStageSection } from "@/components/creators/creator-stage-section";
import type { CreatorTool } from "@/components/creators/creator-tools";
import { CREATOR_TOOLS } from "@/components/creators/creator-tools";
import {
  PageDescription,
  PageTopBar,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { IconChip } from "@/components/ui/icon-chip";
import { cn, PAGE_PADDING_NO_TOP } from "@/lib/utils";

/**
 * A tool's tile, with both ways into the tool: straight to its page, and down
 * to the section that explains the setup. Most of what is here needs a
 * paragraph of setup before the page is any use, but someone who already knows
 * that shouldn't have to scroll past it, so the tile offers both rather than
 * being one big link to either.
 *
 * @returns The tile.
 */
function CreatorToolTile({ tool }: { tool: CreatorTool }) {
  return (
    <Card size="sm" className="h-full">
      <div className="flex flex-1 flex-col gap-1.5 px-3">
        <div className="flex items-center gap-2.5">
          <IconChip icon={tool.icon} tone={tool.tone} size="sm" />
          <span className="font-heading font-medium">{tool.title}</span>
        </div>
        <p className="text-muted-foreground">{tool.blurb}</p>
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          {tool.to === undefined ? null : (
            <Button size="sm" render={<Link to={tool.to} />}>
              Open
            </Button>
          )}
          <Button size="sm" variant="ghost" render={<Link to="/creators" hash={tool.id} />}>
            How to set it up
          </Button>
        </div>
      </div>
    </Card>
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
 * @returns The creators page.
 */
export function CreatorsPage() {
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
            A few things on OpenRift are built for people making Riftbound videos and streams: card
            art on screen without showing your browser, tier lists you can share, and a card lookup
            your chat bot can answer. All of it is free, and nothing needs to be installed.
          </PageDescription>

          <div className="grid gap-3 sm:grid-cols-2">
            {CREATOR_TOOLS.map((tool) => (
              <CreatorToolTile key={tool.id} tool={tool} />
            ))}
          </div>
        </div>

        <CreatorStageSection />

        <CreatorSection id="tier-lists" title="Tier lists">
          <p>
            Drag cards from a set onto a board and rank them from S down to D. When the board looks
            right, share it as a link, or download it as an image for a thumbnail or video.
          </p>
          <p>
            The link works for anyone, signed in or not, and unfurls in chats with the board as its
            preview image. On a phone you pick a tier from a menu instead of dragging, so you can
            build a list there too.
          </p>
          <div>
            <Button variant="outline" render={<Link to="/tier-lists" />}>
              Open the tier list maker
            </Button>
          </div>
        </CreatorSection>

        <CreatorChatSection />

        <CreatorSection id="catalogue" title="About the card data">
          <p>
            I maintain the card catalogue myself, so a brand new set can take a few days to fill in,
            and now and then a printing is missing. If a lookup comes back empty for a card you know
            exists,{" "}
            <Link to="/contribute" className="text-primary underline underline-offset-2">
              tell me about it
            </Link>{" "}
            and I&apos;ll fix it.
          </p>
          <p>If any of this ends up in a video, I&apos;d appreciate a link back.</p>
        </CreatorSection>
      </div>
    </>
  );
}
