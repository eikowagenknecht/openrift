import type { DeckCheckEntryCardResponse, DeckCheckEntryDetailResponse } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import {
  BanIcon,
  CheckIcon,
  EllipsisVerticalIcon,
  Link2Icon,
  PencilIcon,
  RotateCcwIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UndoIcon,
  Unlink2Icon,
  XIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { EntryStateBadge } from "@/components/deck-check/deck-check-event-page";
import { DeckDomainBar } from "@/components/deck/deck-domain-bar";
import { FormatStateBadge } from "@/components/deck/deck-format-badge";
import { FannedPreview, typeCountSummary } from "@/components/deck/deck-tile";
import { DomainIcon } from "@/components/deck/domain-icon";
import {
  PageTopBar,
  PageTopBarActions,
  PageTopBarIconButton,
  PageTopBarPrimaryButton,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import {
  TopBarBreadcrumbSeparator,
  TopBarBreadcrumbTrail,
} from "@/components/layout/top-bar-breadcrumb";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import {
  useDenyTournamentDeckCheckUnlock,
  useUnlinkTournamentDeckCheckEntry,
  useUpdateTournamentDeckCheckEntry,
} from "@/hooks/use-tournament-deck-check";
import { useTournamentDetail } from "@/hooks/use-tournaments";
import { canRequestChanges, primaryActionFor } from "@/lib/deck-check-actions";
import { getDomainGradientStyle } from "@/lib/domain";
import { cn } from "@/lib/utils";

/**
 * The entry page's sticky top bar: the `Tournaments / {name} / Decks` trail
 * (collapsing to a back arrow on phones), the entrant's name as the title with
 * the state badge beside it, and the entry's actions. The trail's `Decks` crumb
 * is the way back to the entrant list.
 * @returns The breadcrumb top bar.
 */
export function DeckEntryTopBar({
  tournamentId,
  entry,
  actions,
}: {
  tournamentId: string;
  entry?: DeckCheckEntryDetailResponse["entry"];
  actions?: ReactNode;
}) {
  const { data: tournament } = useTournamentDetail(tournamentId);
  return (
    <PageTopBarSticky width="capped">
      <PageTopBar className="gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:items-baseline">
          <TopBarBreadcrumbTrail
            segments={[
              { label: "Tournaments", link: <Link to="/tournaments" /> },
              {
                label: tournament.name,
                link: <Link to="/tournaments/$id" params={{ id: tournamentId }} />,
              },
              {
                label: "Decks",
                link: <Link to="/tournaments/$id/decks" params={{ id: tournamentId }} />,
              },
            ]}
          />
          <TopBarBreadcrumbSeparator className="hidden sm:inline" />
          <PageTopBarTitle>{entry?.playerName ?? "Entry"}</PageTopBarTitle>
          {entry ? (
            <EntryStateBadge state={entry.state} reviewOutcome={entry.reviewOutcome} />
          ) : null}
        </div>
        {actions ? <PageTopBarActions>{actions}</PageTopBarActions> : null}
      </PageTopBar>
    </PageTopBarSticky>
  );
}

/**
 * The top-bar actions for an entry: the single contextual primary action for
 * the current state (the filled CTA) plus an overflow menu with edit and, for
 * hosts / organizers, delete. Secondary state actions stay in the body.
 * @returns The entry's top-bar action cluster.
 */
export function EntryTopBarActions({
  entry,
  transition,
  pending,
  canManage,
  onEdit,
  onDelete,
}: {
  entry: DeckCheckEntryDetailResponse["entry"];
  transition: (
    state: "editable" | "submitted" | "approved" | "checked" | "withdrawn",
    reviewOutcome?: "ok" | "issue",
  ) => void;
  pending: boolean;
  canManage: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const primary = primaryActionFor(entry.state);
  return (
    <>
      {primary ? (
        <PageTopBarPrimaryButton
          disabled={pending}
          onClick={() => transition(primary.state, primary.reviewOutcome)}
        >
          <primary.icon />
          {primary.label}
        </PageTopBarPrimaryButton>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger render={<PageTopBarIconButton aria-label="Entry actions" />}>
          <EllipsisVerticalIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <PencilIcon className="size-4" />
            Edit player details
          </DropdownMenuItem>
          {entry.state === "withdrawn" ? null : (
            <DropdownMenuItem disabled={pending} onClick={() => transition("withdrawn")}>
              <BanIcon className="size-4" />
              Withdraw entry
            </DropdownMenuItem>
          )}
          {canManage ? (
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2Icon className="size-4" />
              Delete entry
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/**
 * The /decks-style fanned legend + champion art for this entry, over the
 * legend's domain gradient.
 * @returns The preview block, sized for the hero row.
 */
export function EntryPreview({ cards }: { cards: DeckCheckEntryCardResponse[] }) {
  const { getPreferredPrinting, getPreferredFrontImage } = usePreferredPrinting();
  const domainColors = useDomainColors();

  const legendCardId = cards.find(
    (card) => card.zone === WellKnown.deckZone.LEGEND && card.resolvedCardId,
  )?.resolvedCardId;
  const championCardId = cards.find(
    (card) => card.zone === WellKnown.deckZone.CHAMPION && card.resolvedCardId,
  )?.resolvedCardId;
  const legendDomains = legendCardId ? getPreferredPrinting(legendCardId)?.card.domains : undefined;
  const gradientStyle =
    legendDomains && legendDomains.length > 0
      ? getDomainGradientStyle(legendDomains, "40", domainColors)
      : undefined;

  return (
    <div className="w-full shrink-0 self-start overflow-hidden rounded-lg border md:w-72">
      <FannedPreview
        legendImage={legendCardId ? (getPreferredFrontImage(legendCardId) ?? null) : null}
        championImage={championCardId ? (getPreferredFrontImage(championCardId) ?? null) : null}
        gradientStyle={gradientStyle}
      />
    </div>
  );
}

export function EntryHeader({
  tournamentId,
  entryId,
  detail,
  transition,
  pending,
}: {
  tournamentId: string;
  entryId: string;
  detail: DeckCheckEntryDetailResponse;
  transition: (
    state: "editable" | "submitted" | "approved" | "checked" | "withdrawn",
    reviewOutcome?: "ok" | "issue",
  ) => void;
  /** Whether a state transition is in flight (disables the action buttons). */
  pending: boolean;
}) {
  const { entry } = detail;
  const denyUnlock = useDenyTournamentDeckCheckUnlock();

  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <EntryMetaGrid entry={entry} />
          {entry.state === "editable" ? (
            <p className="text-muted-foreground mt-1.5 text-sm">
              The player is editing this list; it locks again when they submit it.
            </p>
          ) : null}
          {entry.state === "withdrawn" ? (
            <p className="text-muted-foreground mt-1.5 text-sm">
              This entry is withdrawn from the event; restore it from the top bar to review it
              again.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AccountLinkAction tournamentId={tournamentId} entryId={entryId} entry={entry} />
          {entry.state === "submitted" && canRequestChanges(entry) ? (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => transition("editable", "issue")}
            >
              <UndoIcon className="size-4" />
              Request changes
            </Button>
          ) : null}
          {entry.state === "approved" ? (
            <>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => transition("submitted")}
              >
                <RotateCcwIcon className="size-4" />
                Revoke approval
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => transition("checked", "issue")}
              >
                <TriangleAlertIcon className="size-4" />
                Mark issue
              </Button>
            </>
          ) : null}
        </div>
      </div>
      {entry.unlockRequestedAt && (entry.state === "approved" || entry.state === "submitted") ? (
        <div className="border-warning/40 bg-warning-soft flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm">
          <TriangleAlertIcon className="text-warning size-4 shrink-0" />
          <span className="min-w-0 flex-1">
            The player asked to unlock this {entry.state === "approved" ? "approved" : "submitted"}{" "}
            deck for changes.
          </span>
          <Button size="sm" disabled={pending} onClick={() => transition("editable")}>
            Allow editing
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={denyUnlock.isPending}
            onClick={() => denyUnlock.mutate({ tournamentId, entryId })}
          >
            Decline
          </Button>
        </div>
      ) : null}
    </header>
  );
}

/**
 * The entry's secondary details as a compact label / value grid: contact,
 * reviewer (only in the approved / checked states), the public-sharing flags,
 * and the linked account. Rows whose fact is absent are omitted — an unlinked
 * entry shows no Account row at all, since "not linked" is the default and
 * needs no callout (the claim action lives in the header's button row).
 * @returns The metadata grid.
 */
function EntryMetaGrid({ entry }: { entry: DeckCheckEntryDetailResponse["entry"] }) {
  const contact = [entry.riotId].filter(Boolean).join(" · ");
  const reviewer =
    entry.state === "checked" && entry.checkedByName
      ? `${entry.reviewOutcome === "issue" ? "Flagged" : "Checked"} by ${entry.checkedByName}`
      : entry.state === "approved" && entry.approvedByName
        ? `Approved by ${entry.approvedByName}`
        : null;
  return (
    <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      <MetaRow label="Contact">
        {contact || <span className="text-muted-foreground">No contact details</span>}
      </MetaRow>
      {reviewer ? <MetaRow label="Reviewer">{reviewer}</MetaRow> : null}
      <MetaRow label="Sharing">
        <SharingValue entry={entry} />
      </MetaRow>
      {entry.claimedUserId ? (
        <MetaRow label="Account">
          <span className="flex items-center gap-1">
            <Link2Icon className="size-3.5 shrink-0" />
            Linked to {entry.claimedUserName ?? "an account"}
            {entry.claimSource === "self_submit" ? " (self-submitted)" : ""}
          </span>
        </MetaRow>
      ) : null}
    </dl>
  );
}

/**
 * One label / value pair in {@link EntryMetaGrid}: a muted label in the fixed
 * first column, the value in the normal text color in the second.
 * @returns The grid row.
 */
function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

/**
 * The public-sharing flags as check / cross items. Withholding the deck list
 * keeps everything private, so the name and Riot ID read as withheld too
 * regardless of their own flags.
 * @returns The sharing value cell.
 */
function SharingValue({ entry }: { entry: DeckCheckEntryDetailResponse["entry"] }) {
  const published = entry.allowDeckPublishing;
  const items = [
    { label: "Deck list", allowed: published },
    { label: "Name", allowed: published && entry.allowNameSharing },
    { label: "Riot ID", allowed: published && entry.allowRiotIdSharing },
  ];
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
      {items.map((item) => (
        <span
          key={item.label}
          className={cn("flex items-center gap-1", !item.allowed && "text-muted-foreground/50")}
        >
          {item.allowed ? (
            <CheckIcon className="text-success size-3.5" />
          ) : (
            <XIcon className="size-3.5" />
          )}
          {item.label}
        </span>
      ))}
    </span>
  );
}

/**
 * The unlink remedy for a bad auto-match, which also blocks re-matching. There
 * is no manual link: an entry only attaches to an account when the player claims
 * it themselves (auto email match or the claim link), so when an entry is not
 * linked this action shows nothing.
 * @returns The unlink button, or null when the entry is not linked.
 */
function AccountLinkAction({
  tournamentId,
  entryId,
  entry,
}: {
  tournamentId: string;
  entryId: string;
  entry: DeckCheckEntryDetailResponse["entry"];
}) {
  const unlink = useUnlinkTournamentDeckCheckEntry();

  if (!entry.claimedUserId) {
    return null;
  }
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={unlink.isPending}
      title="Detach the account. The entry is never auto-matched again."
      onClick={() => unlink.mutate({ tournamentId, entryId })}
    >
      <Unlink2Icon className="size-4" />
      Unlink
    </Button>
  );
}

/**
 * The judge's message to the player, kept separate from the judge-private
 * notes; the linked player sees it on their entry page.
 * @returns The message field with its save affordance.
 */
export function PlayerMessageField({
  tournamentId,
  entryId,
  entry,
}: {
  tournamentId: string;
  entryId: string;
  entry: DeckCheckEntryDetailResponse["entry"];
}) {
  const updateEntry = useUpdateTournamentDeckCheckEntry();
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const value = dirty ? message : (entry.playerMessage ?? "");

  return (
    <div className="flex flex-col gap-1.5">
      <Textarea
        value={value}
        onChange={(event) => {
          setMessage(event.target.value);
          setDirty(true);
        }}
        placeholder="Message to the player (they see this, unlike the notes)"
        maxLength={2000}
        rows={2}
      />
      {dirty ? (
        <Button
          size="sm"
          variant="outline"
          className="self-end"
          disabled={updateEntry.isPending}
          onClick={() => {
            updateEntry.mutate(
              { tournamentId, entryId, playerMessage: value.trim() || null },
              { onSuccess: () => setDirty(false) },
            );
          }}
        >
          {updateEntry.isPending ? "Saving..." : "Save message"}
        </Button>
      ) : null}
    </div>
  );
}

export function StatsSummary({ detail }: { detail: DeckCheckEntryDetailResponse }) {
  const { getPreferredPrinting } = usePreferredPrinting();

  const legendLine = detail.cards.find((card) => card.zone === WellKnown.deckZone.LEGEND);
  const championLine = detail.cards.find((card) => card.zone === WellKnown.deckZone.CHAMPION);
  const legendDomains = legendLine?.resolvedCardId
    ? getPreferredPrinting(legendLine.resolvedCardId)?.card.domains
    : undefined;
  const typeSummary = typeCountSummary(detail.typeCounts);
  const subtitle = [legendLine?.rawName, championLine?.rawName].filter(Boolean).join(" / ");

  return (
    <div className="flex flex-col gap-2">
      {subtitle ? <p className="text-muted-foreground truncate text-sm">{subtitle}</p> : null}
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1">
          {legendDomains?.map((domain) => (
            <DomainIcon key={domain} domain={domain} />
          ))}
          {typeSummary ? (
            <span className="text-muted-foreground text-2xs ml-1">{typeSummary}</span>
          ) : null}
        </span>
        {detail.event.format ? (
          <FormatStateBadge format={detail.event.format} isValid={detail.violations.length === 0} />
        ) : null}
      </div>
      {detail.domainDistribution.length > 0 ? (
        <DeckDomainBar distribution={detail.domainDistribution} />
      ) : null}
    </div>
  );
}
