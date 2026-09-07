import { Link } from "@tanstack/react-router";
import {
  BellIcon,
  CheckIcon,
  ChevronRightIcon,
  FolderIcon,
  GlobeIcon,
  HeartIcon,
  PackageIcon,
  TrophyIcon,
  UserPlusIcon,
  UsersIcon,
  XIcon,
  ZapIcon,
} from "lucide-react";

import { CoverBand } from "@/components/cover-band";
import { Heading } from "@/components/heading";
import { ActionBand } from "@/components/ui/action-band";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { CardLink } from "@/components/ui/card-link";
import { CardList, CardRow } from "@/components/ui/card-list";
import { Medal, Podium } from "@/components/ui/podium";
import type { PodiumSeat } from "@/components/ui/podium";
import { StatStrip } from "@/components/ui/stat-strip";
import { StatTile } from "@/components/ui/stat-tile";
import { UserAvatar } from "@/components/user-avatar";
import { UserAvatarStack } from "@/components/user-avatar-stack";
import { cn } from "@/lib/utils";

import { DemoRow, DemoSection, Swatch, SwatchRow } from "./demo-primitives";

// Static sample members for the avatar-stack demos. The empty gravatar hash
// keeps the fallback on initials, so the design page makes no network calls.
const STACK_MEMBERS = [
  { userId: "u1", userName: "Poro Herder", userImage: null, gravatarHash: "" },
  { userId: "u2", userName: "Hex Tinkerer", userImage: null, gravatarHash: "" },
  { userId: "u3", userName: "Void Binder", userImage: null, gravatarHash: "" },
  { userId: "u4", userName: "Glacial Mina", userImage: null, gravatarHash: "" },
  { userId: "u5", userName: "Stacked Sam", userImage: null, gravatarHash: "" },
];

const PODIUM_SEATS: PodiumSeat[] = [
  { key: "p1", rank: 1, name: "Poro Herder", score: 12, hint: "3 wins · opp 1.75" },
  { key: "p2", rank: 2, name: "Hex Tinkerer", score: 10, hint: "2 wins · opp 1.71" },
  { key: "p3", rank: 3, name: "Void Binder", score: 9, hint: "2 wins · opp 1.62" },
];

export function TilesSection() {
  return (
    <DemoSection
      id="tiles"
      title="Tiles"
      note="CardLink is the whole-Card click target for list tiles; every tile hovers the same way (shadow lift, muted wash, 1px primary edge). Cards that keep secondary actions inside, and non-Card link tiles like the deck grid, apply cardLinkVariants() directly. CardList and CardRow carry the same Card edge for the two list shapes that are not a Card: one flush panel of rows, and standalone rows in a gapped list. StatTile is the dashboard stat; accent is reserved for the one tile needing attention. StatStrip is its non-linking sibling for inline context counts. ActionBand is the full-width 'needs you' band (the overview's trades hub, the members page's join requests). Podium is the standings throne. CoverBand is the warm-glow strip at the top of showcase tiles (product fans, group avatar stacks); UserAvatarStack is the overlapping who's-here row with a +N overflow."
    >
      <DemoRow label="CardLink">
        <CardLink
          render={<Link to="/admin/design" hash="tiles" />}
          className="w-full max-w-sm flex-row items-center gap-3 p-3"
        >
          <PackageIcon className="text-muted-foreground size-5 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">Jinx&apos;s Arsenal</span>
            <span className="text-muted-foreground text-xs">Tradelist · 24 Cards</span>
          </div>
          <Badge variant="secondary">Shared</Badge>
        </CardLink>
      </DemoRow>
      <DemoRow label="CardLink (image-dominated)">
        <CardLink
          render={<Link to="/admin/design" hash="tiles" />}
          className="w-full max-w-sm gap-0 py-0"
        >
          <div className="bg-muted flex h-24 items-center justify-center rounded-t-lg">
            <PackageIcon className="text-muted-foreground size-8" />
          </div>
          <div className="flex flex-col p-3">
            <span className="font-medium">Piltover Starter</span>
            <span className="text-muted-foreground text-xs">Ready to play</span>
          </div>
        </CardLink>
      </DemoRow>
      <DemoRow
        label="CardList / CardRow"
        hint="The two list shapes that carry the Card edge without being a Card. CardList is one panel with its rows flush inside, separated by their own hover wash — a rail of same-shaped rows. CardRow is a standalone bordered row in a gapped list, for rows that stand apart because each is its own entity. They are alternatives, not a pair: a CardRow never goes inside a CardList."
        className="items-start gap-6"
      >
        <CardList className="w-full max-w-xs">
          {["Round 1", "Round 2", "Round 3"].map((round) => (
            <li
              key={round}
              className="hover:bg-muted/50 flex items-center gap-2.5 rounded-md px-2 py-2"
            >
              <span className="bg-primary/60 size-2 shrink-0 rounded-full" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{round}</span>
              <span className="text-muted-foreground shrink-0 text-xs">finalized</span>
            </li>
          ))}
        </CardList>
        <ul className="flex w-full max-w-xs flex-col gap-1.5">
          {["Vi", "Ekko"].map((name) => (
            <CardRow key={name}>
              <span className="flex min-w-0 items-center gap-2">
                <UserAvatar name={name} size="sm" />
                <span className="truncate font-medium">{name}</span>
              </span>
              <span className="font-semibold tabular-nums">+3 bye</span>
            </CardRow>
          ))}
        </ul>
      </DemoRow>
      <DemoRow label="StatTile">
        <div className="grid w-full max-w-2xl gap-3 sm:grid-cols-2">
          <StatTile
            render={<Link to="/admin/design" hash="tiles" />}
            icon={HeartIcon}
            label="Wishlists"
            value={4}
            hint="2 shared with your group"
          />
          <StatTile
            render={<Link to="/admin/design" hash="tiles" />}
            icon={BellIcon}
            label="Requests"
            value={3}
            accent
            hint="3 requests to review"
          />
        </div>
      </DemoRow>
      <DemoRow
        label="StatTile tones"
        hint="tone tints the icon chip only (the ring stays neutral), so tiles on one overview carry per-surface color without competing with accent. accent overrides tone."
      >
        <div className="grid w-full max-w-4xl gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            render={<Link to="/admin/design" hash="tiles" />}
            icon={ZapIcon}
            label="Trades"
            value={4}
            tone="gold"
            hint="tone=gold"
          />
          <StatTile
            render={<Link to="/admin/design" hash="tiles" />}
            icon={FolderIcon}
            label="Collections"
            value={1}
            tone="info"
            hint="tone=sky"
          />
          <StatTile
            render={<Link to="/admin/design" hash="tiles" />}
            icon={UsersIcon}
            label="Members"
            value={9}
            tone="success"
            hint="tone=green"
          />
          <StatTile
            render={<Link to="/admin/design" hash="tiles" />}
            icon={TrophyIcon}
            label="Tournaments"
            value={2}
            tone="violet"
            hint="tone=violet"
          />
        </div>
      </DemoRow>
      <DemoRow
        label="ActionBand"
        hint="Header row (IconChip, label, headline value, sub, trailing action) with free-form rows below. accent marks the band waiting on the viewer; a band given render is the click target and hovers like StatTile, a static one carries inline actions in its rows. valueClassName takes the headline off the display numeral when it is a sentence rather than a count."
      >
        <div className="flex w-full max-w-2xl flex-col gap-3">
          <ActionBand
            render={<Link to="/admin/design" hash="tiles" />}
            icon={ZapIcon}
            accent
            label="Trades"
            value={3}
            sub="trades need your action"
            action={
              <span className={cn(buttonVariants(), "group-hover/action-band:bg-primary/90")}>
                View trades
                <ChevronRightIcon className="size-4 transition-transform group-hover/action-band:translate-x-0.5" />
              </span>
            }
          />
          <ActionBand
            render={<Link to="/admin/design" hash="tiles" />}
            icon={ZapIcon}
            tone="success"
            label="Trades"
            value="Nothing waiting on you"
            valueClassName="font-sans truncate text-base font-medium"
            action={
              <span className={cn(buttonVariants({ variant: "ghost" }))}>
                View trades
                <ChevronRightIcon className="size-4 transition-transform group-hover/action-band:translate-x-0.5" />
              </span>
            }
          />
          <ActionBand
            icon={UserPlusIcon}
            accent
            label="Requests"
            value={1}
            sub="person waiting to join"
          >
            <div className="bg-muted flex items-center gap-2.5 rounded-lg px-2.5 py-2">
              <span className="min-w-0 flex-1 truncate text-sm">
                <span className="font-medium">Powder Undercity</span>
                <span className="text-muted-foreground"> · requested 2h ago</span>
              </span>
              <Button size="sm">
                <CheckIcon className="size-4" />
                Approve
              </Button>
              <Button size="sm" variant="ghost">
                <XIcon className="size-4" />
                Deny
              </Button>
            </div>
          </ActionBand>
        </div>
      </DemoRow>
      <DemoRow
        label="StatStrip"
        hint="The compact inline counts row — StatTile's quiet sibling, for facts that are context rather than navigation. Nothing links; reach for StatTile when the number should take you somewhere. tone=good tints a value that carries a verdict."
        className="flex-col items-stretch"
      >
        <StatStrip
          items={[
            { key: "active", value: 11, label: "active", icon: CheckIcon, iconTone: "success" },
            { key: "dropped", value: 3, label: "dropped", icon: UsersIcon },
            { key: "regions", value: 4, label: "regions", icon: GlobeIcon, iconTone: "info" },
          ]}
        />
        <StatStrip
          items={[
            { key: "penalty", value: 12, label: "penalty" },
            { key: "rematches", value: 0, label: "rematches", tone: "good" },
            { key: "three", value: 3, label: "in 3-pods" },
            { key: "spread", value: 4, label: "largest spread" },
          ]}
        />
      </DemoRow>
      <DemoRow
        label="Podium"
        hint="The standings throne: top three, winner centered and raised on the accent glow. Ranks render as given — a tie hands two seats rank 1 and both get gold, while the raised seat is the caller's tie-break winner. Owns its degenerate states: ghost seats before the first result, fewer columns for a small field."
        className="items-start gap-6"
      >
        <div className="w-full max-w-sm">
          <Podium seats={PODIUM_SEATS} />
        </div>
        <div className="w-full max-w-sm">
          <Podium seats={PODIUM_SEATS.slice(0, 2)} />
        </div>
        <div className="w-full max-w-sm">
          <Podium seats={[]} emptyLabel="The throne fills after round 1 is finalized." />
        </div>
      </DemoRow>
      <SwatchRow
        label="Medal"
        hint="The rank chip the throne and the standings table share. The on-art variant is the overlay for a tile's splash crop: opaque plate, shadow, and fixed colors in both themes, because it sits on artwork rather than on the page."
      >
        {[1, 2, 3, 9].map((rank) => (
          <Swatch key={`flat-${rank}`} label={`flat ${rank}`} colors>
            <Medal rank={rank} />
          </Swatch>
        ))}
        {[1, 2, 3, 9].map((rank) => (
          <Swatch key={`on-art-${rank}`} label={`onArt ${rank}`} colors>
            <span className="flex items-center justify-center rounded-md bg-[linear-gradient(120deg,#5b3f8f,#2b6f6a)] p-2">
              <Medal rank={rank} variant="onArt" />
            </span>
          </Swatch>
        ))}
      </SwatchRow>
      <DemoRow label="UserAvatarStack">
        <div className="flex flex-wrap items-center gap-6">
          <UserAvatarStack members={STACK_MEMBERS.slice(0, 3)} size="sm" />
          <UserAvatarStack members={STACK_MEMBERS} totalCount={17} />
          <UserAvatarStack members={STACK_MEMBERS} totalCount={8} size="lg" />
        </div>
      </DemoRow>
      <DemoRow label="CardLink (cover band)">
        <CardLink
          render={<Link to="/admin/design" hash="tiles" />}
          className="w-full max-w-sm flex-col gap-0 py-0"
        >
          <CoverBand aria-hidden="true" className="flex h-28 items-center justify-center">
            <UserAvatarStack members={STACK_MEMBERS} totalCount={8} size="lg" />
          </CoverBand>
          <div className="flex min-w-0 flex-col gap-1 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Heading className="min-w-0 truncate">Tuesday Night Crew</Heading>
              <Badge>Owner</Badge>
            </div>
            <p className="text-muted-foreground mt-auto pt-1 text-sm tabular-nums">
              8 members
              <span className="mx-1.5 opacity-60">·</span>
              12 shared lists
            </p>
          </div>
        </CardLink>
      </DemoRow>
    </DemoSection>
  );
}
