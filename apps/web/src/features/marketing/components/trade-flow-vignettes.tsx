import { ArrowDownLeftIcon, ArrowUpRightIcon, CheckIcon, ZapIcon } from "lucide-react";
import type { ReactNode } from "react";

import { UserAvatar } from "@/components/user-avatar";
import type { LandingThumbnailCard } from "@/features/marketing/lib/landing-thumbnails";
import { cn } from "@/lib/utils";

import { ArtStrip, MiniCardArt, Vignette, VignetteHeading } from "./vignette-parts";

// Hand-built from plain markup like the rest of these vignettes (see
// vignette-parts.tsx): the real components pull in filter stores and data
// hooks that have no place on a marketing page.

const THEM = "Mira";

// The landing summary is edge-cached for up to a day and can predate the
// identity fields, hence the fallbacks below.
interface TradedCard {
  url: string;
  name: string;
  detail: string;
}

export function tradedCard(cards: LandingThumbnailCard[]): TradedCard {
  const card = cards[0];
  return {
    url: card?.url ?? "",
    name: card?.name === undefined || card.name === "" ? "That card you wanted" : card.name,
    detail: card?.shortCode ?? "",
  };
}

function DirectionBadge({ incoming }: { incoming: boolean }) {
  const Icon = incoming ? ArrowDownLeftIcon : ArrowUpRightIcon;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-full",
        incoming ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
      )}
    >
      <Icon className="size-4" />
    </span>
  );
}

function MiniBadge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "warning" | "success" | "primary";
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tone === "warning" && "bg-warning-soft text-warning",
        tone === "success" && "bg-success-soft text-success",
        tone === "primary" && "bg-primary text-primary-foreground",
        tone === "neutral" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function MiniButton({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium",
        muted ? "ring-foreground/15 text-foreground ring-1" : "bg-primary text-primary-foreground",
      )}
    >
      {children}
    </span>
  );
}

function MiniPanel({
  children,
  accent,
  className,
}: {
  children: ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-card flex flex-col gap-2 rounded-lg p-3 ring-1",
        accent ? "ring-primary/40" : "ring-border",
        className,
      )}
      style={
        accent
          ? {
              backgroundImage:
                "linear-gradient(135deg, color-mix(in oklab, var(--border-accent) 14%, transparent), transparent 55%)",
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}

function ShelfRow({
  label,
  tone,
  urls,
  extra,
  detail,
}: {
  label: string;
  tone: "warning" | "success";
  urls: string[];
  extra?: number;
  detail: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        className={cn(
          "w-24 shrink-0 text-xs font-semibold tracking-wide uppercase",
          tone === "warning" ? "text-warning" : "text-success",
        )}
      >
        {label}
      </span>
      <ArtStrip urls={urls} extra={extra} />
      <span className="text-muted-foreground min-w-0 truncate text-sm">{detail}</span>
    </div>
  );
}

export function TradeMatchVignette({ thumbnailUrls }: { thumbnailUrls: string[] }) {
  return (
    <Vignette>
      <VignetteHeading>Thursday store crew</VignetteHeading>
      <MiniPanel accent>
        <div className="flex items-center gap-2.5">
          <span className="bg-warning-soft text-warning flex size-9 shrink-0 items-center justify-center rounded-lg">
            <ZapIcon className="size-4.5" aria-hidden="true" />
          </span>
          <span className="text-muted-foreground text-sm font-medium">Trades</span>
          <span className="min-w-0 flex-1 truncate font-medium">3 people are waiting on you</span>
        </div>
        <ShelfRow
          label="You could get"
          tone="success"
          urls={thumbnailUrls.slice(0, 4)}
          extra={5}
          detail="9 cards from 4 members"
        />
        <ShelfRow
          label="They'd want"
          tone="success"
          urls={thumbnailUrls.slice(4, 6)}
          extra={3}
          detail="5 cards, wanted by 3 members"
        />
      </MiniPanel>
    </Vignette>
  );
}

export function TradeRequestVignette({ card }: { card: TradedCard }) {
  return (
    <Vignette>
      <VignetteHeading>Suggestions with {THEM}</VignetteHeading>
      <MiniPanel>
        <div className="flex min-w-0 items-center gap-2.5">
          <DirectionBadge incoming />
          <MiniCardArt url={card.url} className="w-9 shrink-0" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{card.name}</span>
            <span className="text-muted-foreground truncate text-xs">
              Near Mint · matched from your wishlist
            </span>
          </span>
          <UserAvatar name={THEM} size="sm" />
          <MiniButton>Request</MiniButton>
        </div>
      </MiniPanel>
      <p className="text-muted-foreground text-xs">
        Requests expire after a week if nobody answers.
      </p>
    </Vignette>
  );
}

export function TradeReservedVignette({ card }: { card: TradedCard }) {
  return (
    <Vignette>
      <VignetteHeading>Your trades with {THEM}</VignetteHeading>
      <MiniPanel>
        <div className="flex min-w-0 items-center gap-2.5">
          <DirectionBadge incoming />
          <MiniCardArt url={card.url} className="w-9 shrink-0" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{card.name}</span>
            <span className="text-muted-foreground truncate text-xs">
              Coming to you from {THEM}
            </span>
          </span>
          <MiniBadge tone="warning">Reserved</MiniBadge>
        </div>
      </MiniPanel>
      <p className="text-muted-foreground text-xs">
        A reserved copy stops counting for their decks, so nobody else is promised it.
      </p>
    </Vignette>
  );
}

export function TradeSettleVignette() {
  return (
    <Vignette>
      <VignetteHeading>Settling up</VignetteHeading>
      <MiniPanel>
        <div className="flex min-w-0 items-center gap-2.5">
          <UserAvatar name={THEM} size="sm" />
          <span className="min-w-0 flex-1 truncate text-sm">
            <span className="font-medium">{THEM}</span>
            <span className="text-muted-foreground"> handed it over</span>
          </span>
          <MiniBadge tone="success">
            <CheckIcon className="mr-1 size-3" aria-hidden="true" />
            Done
          </MiniBadge>
        </div>
        <div className="flex min-w-0 items-center gap-2.5">
          <UserAvatar name="You" size="sm" />
          <span className="min-w-0 flex-1 truncate text-sm">
            <span className="font-medium">You</span>
            <span className="text-muted-foreground"> receive it into </span>
            <span className="font-medium">Main binder</span>
          </span>
          <MiniButton muted>Mark received</MiniButton>
        </div>
      </MiniPanel>
      <p className="text-muted-foreground text-xs">
        Each side confirms its own half. Neither can log the swap for the other.
      </p>
    </Vignette>
  );
}

export function TradeArrivedVignette({ card }: { card: TradedCard }) {
  return (
    <Vignette>
      <VignetteHeading>Main binder</VignetteHeading>
      <div className="flex items-center gap-4">
        <MiniCardArt url={card.url} className="w-24 shrink-0" />
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="truncate font-medium">{card.name}</span>
          {/* No "traded from Mira" badge: a copy carries no provenance today,
              and the tour must not advertise a field that does not exist. */}
          <span className="flex flex-wrap items-center gap-1.5">
            <MiniBadge tone="success">×1 owned</MiniBadge>
            <MiniBadge>Near Mint</MiniBadge>
          </span>
          <span className="text-muted-foreground text-xs">
            Off your wishlist, and out of {THEM}&apos;s collection.
          </span>
        </div>
      </div>
    </Vignette>
  );
}
