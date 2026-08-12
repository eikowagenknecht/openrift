import type { CardTradeResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import {
  BellIcon,
  CheckIcon,
  ChevronRightIcon,
  EllipsisVerticalIcon,
  HandshakeIcon,
} from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { useState } from "react";

import { CardDetailOverlayProvider } from "@/components/cards/card-detail-opener";
import { EmptyState } from "@/components/empty-state";
import { ContactMethodChips } from "@/components/friend-groups/contact-method-chips";
import { MatchTradeList } from "@/components/friend-groups/match-row-card";
import { BulkTradeActions } from "@/components/friend-groups/trade-bulk-actions";
import { TradeCardmarketExportDialog } from "@/components/friend-groups/trade-cardmarket-export-dialog";
import { TradeRow } from "@/components/friend-groups/trade-row";
import type { TradeBadgeState } from "@/components/friend-groups/trade-row-parts";
import { Heading } from "@/components/heading";
import { TopBarBreadcrumbBar } from "@/components/layout/top-bar-breadcrumb";
import { TradeBalanceBar } from "@/components/trades/trade-balance-bar";
import { TradeSettleSection } from "@/components/trades/trade-settle-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconChip } from "@/components/ui/icon-chip";
import type { IconChipTone } from "@/components/ui/icon-chip";
import { SectionHeading } from "@/components/ui/section-heading";
import { UserAvatar } from "@/components/user-avatar";
import { useTradeSheet, useUserTrades } from "@/hooks/use-card-trades";
import { useCards } from "@/hooks/use-cards";
import { countTradeSuggestions, withoutLiveTradeMatches } from "@/lib/trade-derivation";
import { splitTradeLedger, stepSequence } from "@/lib/trade-sheet";

/**
 * One urgency section of the sheet: a heading with the count, optional bulk
 * actions on its right, and the rows. Renders nothing when empty, which is what
 * lets a one-sided deal shrink the page instead of leaving holes.
 * @returns The section, or null.
 */
function LedgerSection({
  heading,
  icon,
  tone,
  trades,
  groupNames,
  bulk,
  redundantStatus,
}: {
  heading: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  tone?: IconChipTone;
  trades: CardTradeResponse[];
  /** Group names by id, or null while the two share only one group. */
  groupNames: ReadonlyMap<string, string> | null;
  /** Bulk actions rendered on the heading's right, if the section offers any. */
  bulk?: ReactNode;
  /** The state this section's heading already says, dropped from its rows' badges. */
  redundantStatus?: TradeBadgeState;
}) {
  if (trades.length === 0) {
    return null;
  }
  const sequence = stepSequence(trades);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionHeading icon={icon} tone={tone} count={trades.length}>
          {heading}
        </SectionHeading>
        {bulk}
      </div>
      <div className="flex flex-col gap-2">
        {trades.map((trade) => (
          <TradeRow
            key={trade.id}
            trade={trade}
            sequence={sequence}
            groupLabel={groupNames?.get(trade.groupId)}
            redundantStatus={redundantStatus}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * The finished trades between the two people, folded away by default: the pile
 * accrues, rarely needs acting on, and is the one part of the sheet that is
 * purely a record. A swap the viewer has settled their half of counts as
 * completed here even though the trade is still open — from this side it is,
 * and the heading says so.
 * @returns The history fold, or null when the two have never finished a trade.
 */
function HistoryFold({
  trades,
  groupNames,
}: {
  trades: CardTradeResponse[];
  /** Group names by id, or null while the two share only one group. */
  groupNames: ReadonlyMap<string, string> | null;
}) {
  if (trades.length === 0) {
    return null;
  }
  const sequence = stepSequence(trades);
  return (
    <Collapsible defaultOpen={false} className="flex flex-col gap-3">
      <SectionHeading as="h3">
        <CollapsibleTrigger className="group hover:text-foreground flex w-full items-center gap-2.5 text-left transition-colors">
          <IconChip icon={CheckIcon} size="sm" />
          {trades.length} completed {trades.length === 1 ? "trade" : "trades"}
          <ChevronRightIcon className="size-4 shrink-0 transition-transform group-data-[panel-open]:rotate-90" />
        </CollapsibleTrigger>
      </SectionHeading>
      <CollapsibleContent>
        <div className="flex flex-col gap-2">
          {trades.map((trade) => (
            <TradeRow
              key={trade.id}
              trade={trade}
              sequence={sequence}
              groupLabel={groupNames?.get(trade.groupId)}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * The person-level trade sheet: everything moving between the viewer and one
 * other member, pooled across every group the two share. One ledger ordered by
 * urgency — the requests waiting on the viewer, the agreed swaps to exchange,
 * what waits on the other side, then the suggestions that could extend the deal
 * — with the balance bar above answering "what's the deal" in value terms.
 * Position encodes urgency; every row's arrow encodes direction.
 *
 * Settling happens in place, as a session on the ready-to-swap section, rather
 * than on a page of its own: standing at a table you still want to answer the
 * request they just sent and see what the deal is worth, and a second view made
 * every one of those a trip back.
 * @returns The trade-sheet page.
 */
export function TradeSheetPage({ userId }: { userId: string }) {
  const { data: sheet } = useTradeSheet(userId);
  const { data: allTrades } = useUserTrades();
  const { printingsById } = useCards();
  const [exportOpen, setExportOpen] = useState(false);

  const trades = allTrades?.items ?? [];
  // The open sections run in catalog order within each direction, so the rows
  // follow the stack the two people are working through. A printing the catalog
  // has not caught up with sorts last rather than to the top of that stack.
  const ledger = splitTradeLedger(
    trades,
    userId,
    (printingId) => printingsById[printingId]?.canonicalRank ?? Number.MAX_SAFE_INTEGER,
  );

  // Drop suggestions that already have a live trade with this person for the
  // same printing — in any shared group — so a suggestion and the trade it
  // became don't both sit in the same list.
  const incoming = withoutLiveTradeMatches(sheet.othersHaveYourWants, trades);
  const outgoing = withoutLiveTradeMatches(sheet.othersWantYourHaves, trades);

  // The API guarantees at least one shared group (no shared group is a 404), so
  // the first one is always there to send the back arrow and the lists link to.
  const firstGroup = sheet.groups[0];
  const name = sheet.counterparty.name ?? "Member";
  // Which group a trade sits in only tells the viewer something when there is
  // more than one it could have been, so a single shared group names nothing.
  const groupNames =
    sheet.groups.length > 1 ? new Map(sheet.groups.map((group) => [group.id, group.name])) : null;
  // What the balance bar weighs: the trades still in flight. A swap the viewer
  // has settled their half of has moved to history and drops out of here with
  // it, which is right — those cards have changed hands.
  const live = [...ledger.yourMove, ...ledger.readyToSwap, ...ledger.waiting].filter(
    (trade) => trade.status === "pending" || trade.status === "reserved",
  );
  const reserved = live.filter((trade) => trade.status === "reserved");
  const empty =
    ledger.yourMove.length +
      ledger.readyToSwap.length +
      ledger.waiting.length +
      incoming.length +
      outgoing.length ===
    0;

  return (
    // Card names in the trade and suggestion rows below open the detail overlay
    // the provider mounts.
    <CardDetailOverlayProvider>
      {/* The drill-down trail rather than a bare title: the identity block
          below is already the page's name, so the bar says where the sheet
          hangs instead. A sheet pooling several groups is anchored to the
          first one, the same group the trail's parent links point at. */}
      <TopBarBreadcrumbBar
        segments={[
          {
            label: firstGroup.name,
            link: <Link to="/groups/$slug" params={{ slug: firstGroup.slug }} />,
          },
          {
            label: "Trades",
            link: <Link to="/groups/$slug/trades" params={{ slug: firstGroup.slug }} />,
          },
          { label: name },
        ]}
      />

      {/* px-safe matches the gutter the sticky bar's inner column uses, so the
          bar's content edges line up with the column below it. pt-3 is the
          vertical-gap rule: the bar's own pb sits inside its blur band. */}
      <div className="px-safe mx-auto flex w-full max-w-5xl flex-col gap-6 pt-3 pb-12">
        <header className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <UserAvatar
                image={sheet.counterparty.image}
                name={sheet.counterparty.name}
                gravatarHash={sheet.counterparty.gravatarHash}
                size="lg"
                className="size-12"
              />
              <div className="flex min-w-0 flex-col gap-1">
                {/* Level 2's face at level 1: the sheet is about a person, not a
                    product, and the page-title size would shout their name
                    across a page whose job is the rows under it. */}
                <Heading level={2} as="h1" className="truncate">
                  {name}
                </Heading>
                <div className="flex flex-wrap items-center gap-1.5">
                  <ContactMethodChips methods={sheet.counterparty.contactMethods} />
                  {groupNames === null
                    ? null
                    : sheet.groups.map((group) => (
                        <Badge key={group.id} variant="outline">
                          {group.name}
                        </Badge>
                      ))}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {reserved.length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={<Button variant="ghost" size="icon-sm" aria-label="More actions" />}
                  >
                    <EllipsisVerticalIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setExportOpen(true)}>
                      Export for Cardmarket
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </div>

          <TradeBalanceBar trades={live} />
        </header>

        {empty ? (
          <EmptyState
            icon={HandshakeIcon}
            title="Nothing traded yet"
            description="Suggestions appear when your wishlists and their tradelists overlap."
          >
            <Button
              render={
                <Link
                  to="/groups/$slug/members/$userId"
                  params={{ slug: firstGroup.slug, userId }}
                />
              }
            >
              View their lists
            </Button>
          </EmptyState>
        ) : (
          <>
            <LedgerSection
              heading="Your move"
              icon={BellIcon}
              tone="gold"
              trades={ledger.yourMove}
              groupNames={groupNames}
              bulk={<BulkTradeActions trades={ledger.yourMove} mode="accept-decline" />}
              redundantStatus="your-move"
            />
            {ledger.readyToSwap.length > 0 ? (
              <TradeSettleSection trades={ledger.readyToSwap} groupNames={groupNames} />
            ) : null}
            <LedgerSection
              heading={`Waiting on ${name}`}
              trades={ledger.waiting}
              groupNames={groupNames}
              redundantStatus="waiting-for-them"
            />
            {incoming.length > 0 || outgoing.length > 0 ? (
              <section className="flex flex-col gap-3">
                {/* Counted the way the tiles render (per suggestion, not per
                    copy), so the heading never disagrees with the list. */}
                <SectionHeading count={countTradeSuggestions(incoming, outgoing)}>
                  Suggestions
                </SectionHeading>
                <MatchTradeList
                  incoming={incoming}
                  outgoing={outgoing}
                  groupSlug={firstGroup.slug}
                />
              </section>
            ) : null}
          </>
        )}

        <HistoryFold trades={ledger.history} groupNames={groupNames} />
      </div>

      <TradeCardmarketExportDialog
        counterpartyName={sheet.counterparty.name}
        trades={reserved}
        open={exportOpen}
        onOpenChange={setExportOpen}
      />
    </CardDetailOverlayProvider>
  );
}
