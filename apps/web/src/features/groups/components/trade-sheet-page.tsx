import type {
  CardTradeResponse,
  CardTradeSheetResponse,
} from "@openrift/shared/types/api/card-trade";
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

import { EmptyState } from "@/components/empty-state";
import { TopBarBreadcrumbBar } from "@/components/layout/top-bar-breadcrumb";
import { PersonPageHeader } from "@/components/person-page-header";
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
import { CardDetailOverlayProvider } from "@/features/cards/components/card-detail-opener";
import { useCards } from "@/features/cards/hooks/use-cards";
import { ContactMethodChips } from "@/features/groups/components/contact-method-chips";
import { MatchTradeList } from "@/features/groups/components/match-row-card";
import { TradeBalanceBar } from "@/features/groups/components/trade-balance-bar";
import { BulkTradeActions } from "@/features/groups/components/trade-bulk-actions";
import { TradeCardmarketExportDialog } from "@/features/groups/components/trade-cardmarket-export-dialog";
import { TradeRow } from "@/features/groups/components/trade-row";
import type { TradeBadgeState } from "@/features/groups/components/trade-row-parts";
import { TradeSettleSection } from "@/features/groups/components/trade-settle-section";
import { useTradeSheet, useUserTrades } from "@/features/groups/hooks/use-card-trades";
import { useFriendGroupDetail } from "@/features/groups/hooks/use-friend-groups";
import {
  countTradeSuggestions,
  tradeGroupKey,
  withoutLiveTradeMatches,
} from "@/features/groups/lib/trade-derivation";
import { splitTradeLedger, stepSequence } from "@/features/groups/lib/trade-sheet";
import { cn, PAGE_WIDTH } from "@/lib/utils";

function LedgerSection({
  heading,
  icon,
  tone,
  trades,
  showGroupLabels,
  bulk,
  redundantStatus,
}: {
  heading: string;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  tone?: IconChipTone;
  trades: CardTradeResponse[];
  showGroupLabels: boolean;
  bulk?: ReactNode;
  /** Dropped from rows' own badges when the section heading already says it. */
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
            groupLabel={showGroupLabels ? trade.groupName : undefined}
            redundantStatus={redundantStatus}
          />
        ))}
      </div>
    </section>
  );
}

function HistoryFold({
  trades,
  showGroupLabels,
}: {
  trades: CardTradeResponse[];
  showGroupLabels: boolean;
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
              groupLabel={showGroupLabels ? trade.groupName : undefined}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function TradeSheetPage({
  userId,
  fromGroupSlug,
}: {
  userId: string;
  fromGroupSlug?: string;
}) {
  const { data: sheet } = useTradeSheet(userId);
  const anchorGroup = sheet.groups.find((group) => group.slug === fromGroupSlug) ?? sheet.groups[0];
  if (anchorGroup === undefined) {
    return null;
  }
  return <TradeSheetBody userId={userId} sheet={sheet} anchorGroup={anchorGroup} />;
}

function TradeSheetBody({
  userId,
  sheet,
  anchorGroup,
}: {
  userId: string;
  sheet: CardTradeSheetResponse;
  anchorGroup: CardTradeSheetResponse["groups"][number];
}) {
  const { data: allTrades } = useUserTrades();
  const { printingsById } = useCards();
  const [exportOpen, setExportOpen] = useState(false);

  const trades = allTrades?.items ?? [];
  // A printing the catalog has not caught up with sorts last, not first.
  const ledger = splitTradeLedger(
    trades,
    userId,
    (printingId) => printingsById[printingId]?.canonicalRank ?? Number.MAX_SAFE_INTEGER,
  );

  const incoming = withoutLiveTradeMatches(sheet.othersHaveYourWants, trades);
  const outgoing = withoutLiveTradeMatches(sheet.othersWantYourHaves, trades);

  const { data: anchorGroupDetail } = useFriendGroupDetail(anchorGroup.slug);
  // Organize-list shares don't render on the member page, so they don't count.
  const hasListsToSee =
    anchorGroupDetail.shares.some(
      (share) => share.userId === userId && share.listIntent !== "organize",
    ) || anchorGroupDetail.collectionShares.some((share) => share.userId === userId);
  const name = sheet.counterparty.name ?? "Member";
  // A group since deleted still counts: its trades keep the name they were
  // made under and stay on this sheet beside a live group's.
  const groupKeys = new Set(sheet.groups.map((group) => group.id));
  for (const trade of [
    ...ledger.yourMove,
    ...ledger.readyToSwap,
    ...ledger.waiting,
    ...ledger.history,
  ]) {
    groupKeys.add(tradeGroupKey(trade));
  }
  const showGroupLabels = groupKeys.size > 1;
  // Suggestions are always in a live group and key on its slug; trade rows
  // carry their own group name already.
  const groupNamesBySlug = showGroupLabels
    ? new Map(sheet.groups.map((group) => [group.slug, group.name]))
    : null;
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
    <CardDetailOverlayProvider>
      <TopBarBreadcrumbBar
        segments={[
          {
            label: anchorGroup.name,
            link: <Link to="/groups/$slug" params={{ slug: anchorGroup.slug }} />,
          },
          {
            label: "Trades",
            link: <Link to="/groups/$slug/trades" params={{ slug: anchorGroup.slug }} />,
          },
          { label: name },
        ]}
      />

      {/* px-safe matches the sticky bar's inner-column gutter, so content edges line up. */}
      <div className={cn(PAGE_WIDTH.capped, "px-safe flex flex-col gap-6 pt-3 pb-12")}>
        <header className="flex flex-col gap-4">
          <PersonPageHeader
            image={sheet.counterparty.image}
            name={name}
            gravatarHash={sheet.counterparty.gravatarHash}
            actions={
              <>
                {hasListsToSee ? (
                  <Button
                    variant="outline"
                    size="sm"
                    render={
                      <Link
                        to="/groups/$slug/members/$userId"
                        params={{ slug: anchorGroup.slug, userId }}
                      />
                    }
                  >
                    View their lists
                  </Button>
                ) : null}
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
              </>
            }
          >
            <ContactMethodChips methods={sheet.counterparty.contactMethods} />
            {showGroupLabels
              ? sheet.groups.map((group) => (
                  <Badge key={group.id} variant="outline">
                    {group.name}
                  </Badge>
                ))
              : null}
          </PersonPageHeader>

          <TradeBalanceBar trades={live} />
        </header>

        {empty ? (
          // No action here: the header's "View their lists" link sits right above.
          <EmptyState
            icon={HandshakeIcon}
            title="Nothing traded yet"
            description="Suggestions appear when your wishlists and their tradelists overlap."
          />
        ) : (
          <>
            <LedgerSection
              heading="Your move"
              icon={BellIcon}
              tone="gold"
              trades={ledger.yourMove}
              showGroupLabels={showGroupLabels}
              bulk={<BulkTradeActions trades={ledger.yourMove} mode="accept-decline" />}
              redundantStatus="your-move"
            />
            {ledger.readyToSwap.length > 0 ? (
              <TradeSettleSection trades={ledger.readyToSwap} showGroupLabels={showGroupLabels} />
            ) : null}
            <LedgerSection
              heading={`Waiting on ${name}`}
              trades={ledger.waiting}
              showGroupLabels={showGroupLabels}
              redundantStatus="waiting-for-them"
            />
            {incoming.length > 0 || outgoing.length > 0 ? (
              <section className="flex flex-col gap-3">
                <SectionHeading count={countTradeSuggestions(incoming, outgoing)}>
                  Suggestions
                </SectionHeading>
                <MatchTradeList
                  incoming={incoming}
                  outgoing={outgoing}
                  groupSlug={anchorGroup.slug}
                  groupNames={groupNamesBySlug}
                />
              </section>
            ) : null}
          </>
        )}

        <HistoryFold trades={ledger.history} showGroupLabels={showGroupLabels} />
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
