import type { FriendGroupDetailResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { SettingsIcon } from "lucide-react";
import { Fragment } from "react";

import { CardFan, CardFanOutline } from "@/components/cards/card-fan";
import { Eyebrow, Heading } from "@/components/heading";
import { PageDescription } from "@/components/layout/page-top-bar";
import { Button } from "@/components/ui/button";
import { UserAvatarStack } from "@/components/user-avatar-stack";
import { useCards } from "@/hooks/use-cards";
import { useCollections } from "@/hooks/use-collections";
import { useFriendGroupActivity } from "@/hooks/use-friend-groups";
import { frontImageId } from "@/lib/card-meta";
import { distinctPrintingIds } from "@/lib/friend-group-activity";

/** How many member avatars the hero stack shows before collapsing to "+N". */
const HERO_AVATARS = 5;

/** One count in the hero's meta line, linking to the page that owns it. */
interface HeroStat {
  key: string;
  to: "/groups/$slug/members" | "/groups/$slug/shared" | "/groups/$slug/trades";
  label: string;
}

// The band's backdrop, bottom layer up: a soft surface tint fading into the
// page background, a faint violet under-tone, and the warm accent glow rising
// toward the fan corner — so the band reads as the group's display case, not
// a flat box. Token-based so both themes carry it.
const HERO_WASH = [
  "radial-gradient(90% 130% at 85% 10%, color-mix(in oklab, var(--border-accent) 26%, transparent), transparent 62%)",
  "radial-gradient(70% 120% at 65% 100%, color-mix(in oklab, oklch(0.5 0.11 300) 14%, transparent), transparent 65%)",
  "linear-gradient(color-mix(in oklab, var(--muted) 50%, var(--background)), var(--background))",
].join(", ");

/**
 * The group overview's identity band: a borderless, square-cornered hero
 * bounded to the content column, carrying the page title (there is no page
 * top bar on the overview — this band is the title row), the description, an
 * at-a-glance meta line, the member avatar stack, and the Manage action; on
 * the right, a fan of card art from the group's recent activity (dashed
 * outlines until the group has traded).
 * @returns The hero band element.
 */
export function FriendGroupHero({ slug, data }: { slug: string; data: FriendGroupDetailResponse }) {
  const { data: activity } = useFriendGroupActivity(slug);
  const { printingsById } = useCards();
  const { data: collections } = useCollections();

  // The fan shows the group's own cards: art from the most recent card-bearing
  // activity, one slot per distinct printing.
  const covers = distinctPrintingIds(
    activity.events.filter((event) => event.kind === "trade-completed" || event.kind === "match"),
  )
    .flatMap((printingId) => {
      const imageId = frontImageId(printingsById[printingId]);
      return imageId ? [{ key: printingId, imageId }] : [];
    })
    .slice(0, 4);

  const groupCollectionCount = collections.filter(
    (collection) => collection.groupId === data.group.id,
  ).length;
  // Each count is the shortest route to the page that owns it, so the meta line
  // doubles as the hero's navigation. All three targets take the same `slug`
  // param, which is what lets them share one typed `to` union.
  const meta: HeroStat[] = [
    {
      key: "members",
      to: "/groups/$slug/members",
      label: `${data.members.length} ${data.members.length === 1 ? "member" : "members"}`,
    },
    ...(groupCollectionCount > 0
      ? [
          {
            key: "collections",
            to: "/groups/$slug/shared" as const,
            label: `${groupCollectionCount} group ${groupCollectionCount === 1 ? "collection" : "collections"}`,
          },
        ]
      : []),
    ...(data.cardsTradedCount > 0
      ? [
          {
            key: "traded",
            to: "/groups/$slug/trades" as const,
            label: `${data.cardsTradedCount} ${data.cardsTradedCount === 1 ? "card" : "cards"} traded`,
          },
        ]
      : []),
  ];

  const shownMembers = data.members.slice(0, HERO_AVATARS);

  return (
    <div className="px-safe pt-4">
      {/* The wash lives on the column-bounded box (square corners, no ring),
          so it ends where the content ends instead of smearing across ultra-
          wide viewports. The fan's own glow is off — HERO_WASH is the glow. */}
      <section
        className="relative mx-auto w-full max-w-5xl overflow-hidden"
        style={{ backgroundImage: HERO_WASH }}
      >
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-3 right-3 z-10"
          render={<Link to="/groups/$slug/manage" params={{ slug }} />}
        >
          <SettingsIcon />
          Manage
        </Button>
        <div className="flex items-end gap-6">
          <div className="flex min-w-0 flex-1 flex-col gap-2.5 py-6 pl-5">
            <Eyebrow variant="kicker">Friend group</Eyebrow>
            <Heading level={1} className="text-3xl text-balance">
              {data.group.name}
            </Heading>
            {data.group.description ? (
              <PageDescription>{data.group.description}</PageDescription>
            ) : null}
            <p className="text-muted-foreground text-sm">
              {meta.map((stat, index) => (
                <Fragment key={stat.key}>
                  {index > 0 ? " · " : null}
                  <Link
                    to={stat.to}
                    params={{ slug }}
                    className="hover:text-foreground underline-offset-4 hover:underline"
                  >
                    {stat.label}
                  </Link>
                </Fragment>
              ))}
            </p>
            <UserAvatarStack
              members={shownMembers}
              totalCount={data.members.length}
              className="mt-1"
              avatarClassName="bg-background ring-background"
            />
          </div>
          {/* CardFan positions absolutely; this div is its relative host, and
              the section's overflow-hidden crops the bottom-anchored cards. */}
          <div aria-hidden="true" className="relative hidden h-36 w-72 shrink-0 self-end sm:block">
            {covers.length === 0 ? <CardFanOutline /> : <CardFan covers={covers} />}
          </div>
        </div>
      </section>
    </div>
  );
}
