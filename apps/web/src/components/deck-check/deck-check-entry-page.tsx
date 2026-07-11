import type {
  DeckCheckChangeSummary,
  DeckCheckEntryCardResponse,
  DeckCheckEntryDetailResponse,
  Printing,
} from "@openrift/shared";
import { WellKnown, getOrientation, imageUrl, legendDisplayName } from "@openrift/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  BanIcon,
  CheckIcon,
  EllipsisVerticalIcon,
  ExpandIcon,
  LayoutGridIcon,
  Link2Icon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
  Rows3Icon,
  ShrinkIcon,
  ThumbsUpIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UndoIcon,
  Unlink2Icon,
  WandSparklesIcon,
  XIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { CardCell } from "@/components/cards/card-cell";
import { CardStrip, StripIconButton } from "@/components/cards/card-strip";
import { useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { ConfirmActionDialog } from "@/components/confirm-action-dialog";
import { EntryStateBadge } from "@/components/deck-check/deck-check-event-page";
import { DeckCheckCardZonesSkeleton } from "@/components/deck-check/deck-check-skeletons";
import { DeckDomainBar } from "@/components/deck/deck-domain-bar";
import {
  DomainIcon,
  FannedPreview,
  FormatStateBadge,
  typeCountSummary,
} from "@/components/deck/deck-tile";
import { HoveredCardPreview } from "@/components/deck/hovered-card-preview";
import { ColumnControls } from "@/components/filters/column-controls";
import { SortGroupControls } from "@/components/filters/sort-group-controls";
import type { SortGroupOption } from "@/components/filters/sort-group-controls";
import { ImportCatalogSearch } from "@/components/import/import-catalog-search";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pressable } from "@/components/ui/pressable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCards } from "@/hooks/use-cards";
import { useDomainColors } from "@/hooks/use-domain-colors";
import { useEnumOrders, useZoneOrder } from "@/hooks/use-enums";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { usePreferredPrinting } from "@/hooks/use-preferred-printing";
import { useResponsiveColumns } from "@/hooks/use-responsive-columns";
import {
  useAddTournamentDeckCheckCard,
  useApplyTournamentDeckCheckZoneFixes,
  useTournamentDeckCheckEntry,
  useDeleteTournamentDeckCheckEntry,
  useDenyTournamentDeckCheckUnlock,
  useFixTournamentDeckCheckCard,
  useRemoveTournamentDeckCheckCard,
  useReResolveTournamentDeckCheck,
  useSetTournamentDeckCheckEntryState,
  useTickTournamentDeckCheckCard,
  useUnlinkTournamentDeckCheckEntry,
  useUpdateTournamentDeckCheckEntry,
} from "@/hooks/use-tournament-deck-check";
import { useTournamentDetail } from "@/hooks/use-tournaments";
import { canRequestChanges } from "@/lib/deck-check-actions";
import { sortDeckCheckCards } from "@/lib/deck-check-sort";
import { getDomainGradientStyle } from "@/lib/domain";
import { matchesAllTokens, normalizedStartsWith, searchTokens } from "@/lib/search-match";
import { cn } from "@/lib/utils";
import { useDeckCheckViewStore } from "@/stores/deck-check-view-store";
import type { DeckCheckDisplayMode, DeckCheckSort } from "@/stores/deck-check-view-store";

/**
 * The entry page's sticky top bar: the `Tournaments / {name} / Decks` trail
 * (collapsing to a back arrow on phones), the entrant's name as the title with
 * the state badge beside it, and the entry's actions. The trail's `Decks` crumb
 * is the way back to the entrant list.
 * @returns The breadcrumb top bar.
 */
function DeckEntryTopBar({
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
    <PageTopBarSticky maxWidth="5xl">
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
 * The checker: lifecycle controls, advisory legality findings, deck stats, and
 * the zone-grouped card list where each card is a tappable verification tick.
 * Polls so concurrent judges reconcile.
 * @returns The checker page content.
 */
export function TournamentDeckCheckEntry({
  tournamentId,
  entryId,
  canManage,
}: {
  tournamentId: string;
  entryId: string;
  /** Host / organizer: may delete entries (judges can review but not delete). */
  canManage: boolean;
}) {
  const { data: detail, refetch } = useTournamentDeckCheckEntry(tournamentId, entryId);
  const wide = useDeckCheckViewStore((state) => state.wide);
  const setWide = useDeckCheckViewStore((state) => state.setWide);
  const displayMode = useDeckCheckViewStore((state) => state.displayMode);
  const setDisplayMode = useDeckCheckViewStore((state) => state.setDisplayMode);
  const sortBy = useDeckCheckViewStore((state) => state.sortBy);
  const setSortBy = useDeckCheckViewStore((state) => state.setSortBy);
  const sortDir = useDeckCheckViewStore((state) => state.sortDir);
  const setSortDir = useDeckCheckViewStore((state) => state.setSortDir);
  const maxColumns = useDeckCheckViewStore((state) => state.maxColumns);
  const setMaxColumns = useDeckCheckViewStore((state) => state.setMaxColumns);
  const { containerRef, columns, physicalMax, physicalMin, autoColumns, containerWidth } =
    useResponsiveColumns(maxColumns);
  const [notes, setNotes] = useState("");
  const [notesDirty, setNotesDirty] = useState(false);
  const [addCardOpen, setAddCardOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const setState = useSetTournamentDeckCheckEntryState();
  const deleteEntry = useDeleteTournamentDeckCheckEntry();
  const navigate = useNavigate();

  // A state transition, folding in any unsaved notes so a judge's notes survive
  // when they advance the entry from the top bar or the action row.
  const transition = (
    state: "editable" | "submitted" | "approved" | "checked" | "withdrawn",
    reviewOutcome?: "ok" | "issue",
  ) => {
    setState.mutate(
      {
        tournamentId,
        entryId,
        state,
        reviewOutcome,
        ...(notesDirty ? { notes: notes.trim() || null } : {}),
      },
      { onSuccess: () => setNotesDirty(false) },
    );
  };

  if (!detail) {
    return (
      <>
        <DeckEntryTopBar tournamentId={tournamentId} />
        <div className="px-safe mx-auto flex w-full max-w-5xl flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex flex-col gap-4 md:flex-row">
            <Skeleton className="aspect-[4/3] w-full shrink-0 rounded-lg md:w-72" />
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          </div>
          <DeckCheckCardZonesSkeleton cellWidth={CHECK_CELL_WIDTH} />
        </div>
      </>
    );
  }

  // The rendered width of one card, derived from the resolved column count, for
  // image resolution and for sizing the small content-width flow zones.
  const cellWidth =
    columns > 0 && containerWidth > 0
      ? Math.floor((containerWidth - (columns - 1) * CHECK_GRID_GAP) / columns)
      : CHECK_CELL_WIDTH;

  // An editable list has not been delivered to an official (TR 401.3): the
  // server sends no cards, and the page shows a notice instead of the deck.
  const listHidden = detail.entry.state === "editable";

  return (
    <>
      <DeckEntryTopBar
        tournamentId={tournamentId}
        entry={detail.entry}
        actions={
          <EntryTopBarActions
            entry={detail.entry}
            transition={transition}
            pending={setState.isPending}
            canManage={canManage}
            onEdit={() => setEditOpen(true)}
            onDelete={() => setDeleteOpen(true)}
          />
        }
      />
      <div className="px-safe mx-auto flex w-full max-w-5xl flex-col gap-4">
        <EntryHeader
          tournamentId={tournamentId}
          entryId={entryId}
          detail={detail}
          transition={transition}
          pending={setState.isPending}
        />
        <div className="flex flex-col gap-4 md:flex-row">
          {listHidden ? null : <EntryPreview cards={detail.cards} />}
          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {listHidden ? null : <StatsSummary detail={detail} />}
            <Textarea
              value={notesDirty ? notes : (detail.entry.notes ?? "")}
              onChange={(event) => {
                setNotes(event.target.value);
                setNotesDirty(true);
              }}
              placeholder="Notes for this entry (saved with a state change, not shared with the player)"
              maxLength={4000}
              rows={3}
              className="flex-1"
            />
            <PlayerMessageField
              tournamentId={tournamentId}
              entryId={entryId}
              entry={detail.entry}
            />
          </div>
        </div>
        {detail.entry.changeSummary ? <ChangeBanner summary={detail.entry.changeSummary} /> : null}
        <FindingsBanner
          tournamentId={tournamentId}
          detail={detail}
          onResolved={() => void refetch()}
        />
        {listHidden ? (
          <p className="text-muted-foreground bg-muted/50 rounded-md border p-3 text-sm">
            The player is editing this list. To respect the tournament rules, it stays hidden from
            judges until they submit it, or until submissions close, when it is sent in as-is.
          </p>
        ) : null}
      </div>
      {listHidden ? null : (
        <div
          className={cn(
            "px-safe w-full pt-4 pb-4",
            (!wide || displayMode === "list") && "mx-auto max-w-5xl",
          )}
        >
          <div className="mb-2 flex flex-wrap items-center justify-end gap-2">
            {detail.entry.state === "submitted" ? (
              <Button variant="outline" onClick={() => setAddCardOpen(true)}>
                <PlusIcon className="size-4" />
                Add card
              </Button>
            ) : null}
            <SortGroupControls
              sortOptions={CHECK_SORT_OPTIONS}
              sortBy={sortBy}
              sortDir={sortDir}
              onSortByChange={setSortBy}
              onSortDirChange={setSortDir}
            />
            <DisplayModeToggle mode={displayMode} onModeChange={setDisplayMode} />
            {displayMode === "grid" ? (
              <ColumnControls
                maxColumns={maxColumns}
                autoColumns={autoColumns}
                minColumns={physicalMin}
                maxColumnsLimit={physicalMax}
                onMaxColumnsChange={setMaxColumns}
              />
            ) : null}
            {displayMode === "grid" ? (
              <Button
                variant="outline"
                className="hidden md:flex"
                aria-pressed={wide}
                onClick={() => setWide(!wide)}
              >
                {wide ? <ShrinkIcon className="size-4" /> : <ExpandIcon className="size-4" />}
                {wide ? "Narrow view" : "Wide view"}
              </Button>
            ) : null}
          </div>
          <AddCardDialog
            tournamentId={tournamentId}
            entryId={entryId}
            open={addCardOpen}
            onOpenChange={setAddCardOpen}
          />
          <div ref={containerRef}>
            <CardChecklist
              tournamentId={tournamentId}
              entryId={entryId}
              cards={detail.cards}
              displayMode={displayMode}
              sortBy={sortBy}
              sortDir={sortDir}
              columns={columns}
              cellWidth={cellWidth}
              locked={detail.entry.state !== "submitted"}
              fixLocked={!zoneFixAllowed(detail.entry.state)}
              fixZoneOnly={detail.entry.state === "approved" || detail.entry.state === "checked"}
              tickLocked={detail.entry.state !== "submitted" && detail.entry.state !== "approved"}
              onStale={() => void refetch()}
            />
          </div>
        </div>
      )}
      <EditPlayerDialog
        tournamentId={tournamentId}
        entryId={entryId}
        entry={detail.entry}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      {canManage ? (
        <ConfirmActionDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title="Delete this entry?"
          description="The player's list and check history are removed. This cannot be undone. Withdraw the entry instead if they only dropped out."
          confirmLabel="Delete"
          pendingLabel="Deleting..."
          isPending={deleteEntry.isPending}
          onConfirm={async () => {
            await deleteEntry.mutateAsync({ tournamentId, entryId });
            setDeleteOpen(false);
            void navigate({ to: "/tournaments/$id/decks", params: { id: tournamentId } });
          }}
        />
      ) : null}
    </>
  );
}

/**
 * The top-bar actions for an entry: the single contextual primary action for
 * the current state (the filled CTA) plus an overflow menu with edit and, for
 * hosts / organizers, delete. Secondary state actions stay in the body.
 * @returns The entry's top-bar action cluster.
 */
function EntryTopBarActions({
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
 * The single contextual primary action for a state.
 * @returns The action descriptor, or null when the state has no primary action.
 */
function primaryActionFor(state: DeckCheckEntryDetailResponse["entry"]["state"]): {
  label: string;
  icon: typeof CheckIcon;
  state: "editable" | "submitted" | "approved" | "checked" | "withdrawn";
  reviewOutcome?: "ok" | "issue";
} | null {
  switch (state) {
    case "editable": {
      return { label: "Lock as submitted", icon: CheckIcon, state: "submitted" };
    }
    case "submitted": {
      return { label: "Approve list", icon: ThumbsUpIcon, state: "approved" };
    }
    case "approved": {
      return { label: "Mark checked", icon: CheckIcon, state: "checked", reviewOutcome: "ok" };
    }
    case "checked": {
      return { label: "Re-open", icon: RotateCcwIcon, state: "submitted" };
    }
    case "withdrawn": {
      return { label: "Restore entry", icon: RotateCcwIcon, state: "submitted" };
    }
    default: {
      return null;
    }
  }
}

/**
 * The /decks-style fanned legend + champion art for this entry, over the
 * legend's domain gradient.
 * @returns The preview block, sized for the hero row.
 */
function EntryPreview({ cards }: { cards: DeckCheckEntryCardResponse[] }) {
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

function EntryHeader({
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
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/60 bg-amber-500/10 p-3 text-sm">
          <TriangleAlertIcon className="size-4 shrink-0 text-amber-600 dark:text-amber-500" />
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
            <CheckIcon className="size-3.5 text-green-600 dark:text-green-500" />
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
function PlayerMessageField({
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

function EditPlayerDialog({
  tournamentId,
  entryId,
  entry,
  open,
  onOpenChange,
}: {
  tournamentId: string;
  entryId: string;
  entry: DeckCheckEntryDetailResponse["entry"];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [playerName, setPlayerName] = useState(entry.playerName);
  const [riotId, setRiotId] = useState(entry.riotId ?? "");
  const [allowDeckPublishing, setAllowDeckPublishing] = useState(entry.allowDeckPublishing);
  const [allowNameSharing, setAllowNameSharing] = useState(entry.allowNameSharing);
  const [allowRiotIdSharing, setAllowRiotIdSharing] = useState(entry.allowRiotIdSharing);
  const updateEntry = useUpdateTournamentDeckCheckEntry();

  const handleSave = async () => {
    const name = playerName.trim();
    if (!name) {
      return;
    }
    await updateEntry.mutateAsync({
      tournamentId,
      entryId,
      playerName: name,
      riotId: riotId.trim() || null,
      allowDeckPublishing,
      allowNameSharing,
      allowRiotIdSharing,
    });
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setPlayerName(entry.playerName);
          setRiotId(entry.riotId ?? "");
          setAllowDeckPublishing(entry.allowDeckPublishing);
          setAllowNameSharing(entry.allowNameSharing);
          setAllowRiotIdSharing(entry.allowRiotIdSharing);
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit player details</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deck-check-player-name">Name</Label>
            <Input
              id="deck-check-player-name"
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
              maxLength={120}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deck-check-riot-id">Riot ID (optional)</Label>
            <Input
              id="deck-check-riot-id"
              value={riotId}
              onChange={(event) => setRiotId(event.target.value)}
              maxLength={120}
              placeholder="Player#EUW"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Public sharing</Label>
            <div className="flex items-center gap-2">
              <Checkbox
                id="deck-check-publish"
                checked={allowDeckPublishing}
                onCheckedChange={(checked) => setAllowDeckPublishing(checked === true)}
              />
              <Label htmlFor="deck-check-publish" className="font-normal">
                Deck list may be published publicly after the event
              </Label>
            </div>
            <div className="ml-6 flex items-center gap-2">
              <Checkbox
                id="deck-check-share-name"
                checked={allowNameSharing}
                disabled={!allowDeckPublishing}
                onCheckedChange={(checked) => setAllowNameSharing(checked === true)}
              />
              <Label
                htmlFor="deck-check-share-name"
                className="font-normal data-[disabled]:opacity-50"
                data-disabled={!allowDeckPublishing || undefined}
              >
                ...including the name
              </Label>
            </div>
            <div className="ml-6 flex items-center gap-2">
              <Checkbox
                id="deck-check-share-riot-id"
                checked={allowRiotIdSharing}
                disabled={!allowDeckPublishing}
                onCheckedChange={(checked) => setAllowRiotIdSharing(checked === true)}
              />
              <Label
                htmlFor="deck-check-share-riot-id"
                className="font-normal data-[disabled]:opacity-50"
                data-disabled={!allowDeckPublishing || undefined}
              >
                ...including the Riot ID
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={updateEntry.isPending || !playerName.trim()}>
              {updateEntry.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Card-name input with catalog typeahead, shared by the add-card and fix-card
 * dialogs. Free text stays valid (unknown names become flagged placeholders).
 * @returns The combobox field.
 */
function CardNameSearchField({
  initialName,
  onNameChange,
}: {
  initialName?: string;
  onNameChange: (name: string) => void;
}) {
  const { printingsByCardId } = useCards();
  const { labels } = useEnumOrders();
  return (
    <ImportCatalogSearch<Printing>
      ariaLabel="Card name"
      placeholder="Search card name"
      initialQuery={initialName}
      getResults={(query) => {
        const tokens = searchTokens(query);
        if (tokens.length === 0) {
          return [];
        }
        const matches: Printing[] = [];
        for (const printings of printingsByCardId.values()) {
          const printing = printings[0];
          // Match the colloquial Legend name too, so "Azir" finds "Emperor of
          // the Sands" (displayed as "Azir, Emperor of the Sands").
          if (printing && matchesAllTokens(tokens, legendDisplayName(printing.card))) {
            matches.push(printing);
          }
        }
        return matches
          .toSorted(
            (first, second) =>
              Number(normalizedStartsWith(legendDisplayName(second.card), query)) -
                Number(normalizedStartsWith(legendDisplayName(first.card), query)) ||
              legendDisplayName(first.card).localeCompare(legendDisplayName(second.card)),
          )
          .slice(0, 8);
      }}
      getKey={(printing) => printing.cardId}
      renderItem={(printing) => (
        <>
          <span className="truncate font-medium">{legendDisplayName(printing.card)}</span>
          <span className="text-muted-foreground shrink-0">
            {printing.card.types.map((slug) => labels.cardTypes[slug]).join(" ")}
          </span>
        </>
      )}
      onSelect={(printing) => onNameChange(legendDisplayName(printing.card))}
      fillOnSelect={(printing) => legendDisplayName(printing.card)}
      onQueryChange={onNameChange}
      inputClassName="w-full"
    />
  );
}

/**
 * Whether a judge may still correct a card's zone in this entry state. Adding,
 * removing, and re-identifying cards stay locked to the submitted state
 * (ADR-027), but a mis-zoned import is a filing error rather than a change to
 * the deck's contents, so zone corrections remain allowed once the list is
 * approved or checked.
 * @returns True for submitted, approved, and checked.
 */
function zoneFixAllowed(state: DeckCheckEntryDetailResponse["entry"]["state"]): boolean {
  return state === "submitted" || state === "approved" || state === "checked";
}

function FixCardDialog({
  tournamentId,
  entryId,
  card,
  open,
  onOpenChange,
  zoneOnly = false,
}: {
  tournamentId: string;
  entryId: string;
  card: DeckCheckEntryCardResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Restrict the dialog to moving the card between zones, leaving its name (and
   * thus its catalog identity) fixed. Used once a list is approved or checked,
   * where re-identifying a card would amount to swapping it out.
   */
  zoneOnly?: boolean;
}) {
  const { zoneOrder, zoneLabels } = useZoneOrder();
  const [name, setName] = useState(card.rawName);
  const [section, setSection] = useState<string>(card.zone);
  const [copies, setCopies] = useState(String(card.quantity));
  const fixCard = useFixTournamentDeckCheckCard();

  const zoneChanged = section !== card.zone;
  // Only a multi-copy line moving to a different zone can be split.
  const splittable = zoneChanged && card.quantity > 1;
  const parsedCopies = Number(copies);
  const copiesValid =
    !splittable ||
    (Number.isInteger(parsedCopies) && parsedCopies >= 1 && parsedCopies <= card.quantity);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed || !copiesValid) {
      return;
    }
    await fixCard.mutateAsync({
      tournamentId,
      entryId,
      cardId: card.id,
      name: trimmed,
      // Only sent when the judge actually moved the card, so a name-only fix
      // leaves the original provider section string untouched.
      section: zoneChanged ? section : undefined,
      copies: splittable ? parsedCopies : undefined,
    });
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setName(card.rawName);
          setSection(card.zone);
          setCopies(String(card.quantity));
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogForm onSubmit={() => void handleSave()}>
          <DialogHeader>
            <DialogTitle>{zoneOnly ? "Move card" : "Fix card"}</DialogTitle>
            <DialogDescription>
              {zoneOnly
                ? "Move the card to the right zone. Its name can't be changed once the list is approved, but ticks stay."
                : "Correct the submitted name or move the card to the right zone. The name is matched against the catalog again, but ticks stay."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {zoneOnly ? (
              <div className="flex flex-col gap-1.5">
                <Label>Card name</Label>
                <p className="text-muted-foreground text-sm">{card.rawName}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label>Card name</Label>
                <CardNameSearchField
                  key={String(open)}
                  initialName={card.rawName}
                  onNameChange={setName}
                />
              </div>
            )}
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label>Zone</Label>
                <Select value={section} onValueChange={(value) => setSection(value ?? card.zone)}>
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(value: string) => zoneLabels[value as never] ?? value}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {zoneOrder.map((zone) => (
                      <SelectItem key={zone} value={zone}>
                        {zoneLabels[zone]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {splittable ? (
                <div className="flex w-28 flex-col gap-1.5">
                  <Label htmlFor="deck-check-fix-copies">Copies to move</Label>
                  <Input
                    id="deck-check-fix-copies"
                    inputMode="numeric"
                    value={copies}
                    onChange={(event) => setCopies(event.target.value.replaceAll(/[^0-9]/gu, ""))}
                  />
                </div>
              ) : null}
            </div>
            {splittable ? (
              <p className="text-muted-foreground text-sm">
                {parsedCopies >= card.quantity
                  ? `Moves all ${card.quantity} copies to ${zoneLabels[section as never] ?? section}.`
                  : `Moves ${copiesValid ? parsedCopies : "?"} of ${card.quantity} copies. The rest stay in ${zoneLabels[card.zone]}.`}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={fixCard.isPending || !name.trim() || !copiesValid}>
              {fixCard.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}

function AddCardDialog({
  tournamentId,
  entryId,
  open,
  onOpenChange,
}: {
  tournamentId: string;
  entryId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { zoneOrder, zoneLabels } = useZoneOrder();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [section, setSection] = useState<string>(WellKnown.deckZone.MAIN);
  const addCard = useAddTournamentDeckCheckCard();

  const handleAdd = async () => {
    const trimmed = name.trim();
    const parsedQuantity = Number(quantity);
    if (
      !trimmed ||
      !Number.isInteger(parsedQuantity) ||
      parsedQuantity < 1 ||
      parsedQuantity > 99
    ) {
      return;
    }
    await addCard.mutateAsync({
      tournamentId,
      entryId,
      name: trimmed,
      quantity: parsedQuantity,
      section,
    });
    setName("");
    setQuantity("1");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogForm onSubmit={() => void handleAdd()}>
          <DialogHeader>
            <DialogTitle>Add card</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Card name</Label>
              <CardNameSearchField key={String(open)} onNameChange={setName} />
            </div>
            <div className="flex gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="deck-check-card-quantity">Copies</Label>
                <Input
                  id="deck-check-card-quantity"
                  inputMode="numeric"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value.replaceAll(/[^0-9]/gu, ""))}
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label>Zone</Label>
                <Select
                  value={section}
                  onValueChange={(value) => setSection(value ?? WellKnown.deckZone.MAIN)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(value: string) => zoneLabels[value as never] ?? value}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {zoneOrder.map((zone) => (
                      <SelectItem key={zone} value={zone}>
                        {zoneLabels[zone]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={addCard.isPending || !name.trim()}>
              {addCard.isPending ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}

function ChangeBanner({ summary }: { summary: DeckCheckChangeSummary }) {
  const describe = (line: { name: string; quantity: number }) => `${line.quantity}× ${line.name}`;
  return (
    <div className="border-destructive/50 bg-destructive/10 flex flex-col gap-1 rounded-md border p-3 text-sm">
      <span className="font-medium">This list changed since a judge last reviewed it.</span>
      {summary.added.length > 0 ? (
        <span>Added: {summary.added.map((line) => describe(line)).join(", ")}</span>
      ) : null}
      {summary.removed.length > 0 ? (
        <span>Removed: {summary.removed.map((line) => describe(line)).join(", ")}</span>
      ) : null}
      {summary.changed.length > 0 ? (
        <span>
          Changed:{" "}
          {summary.changed
            .map((line) => `${line.name} ${line.oldQuantity}× → ${line.newQuantity}×`)
            .join(", ")}
        </span>
      ) : null}
    </div>
  );
}

function FindingsBanner({
  tournamentId,
  detail,
  onResolved,
}: {
  tournamentId: string;
  detail: DeckCheckEntryDetailResponse;
  onResolved: () => void;
}) {
  const reResolve = useReResolveTournamentDeckCheck();
  const [fixZonesOpen, setFixZonesOpen] = useState(false);
  const unmatched = detail.cards.filter((card) => card.matchStatus !== "matched");
  const suggestions = detail.zoneSuggestions;
  // Zone corrections are allowed while submitted, approved, or checked — the same
  // gate the per-card pencil uses. Add/remove stays locked to submitted.
  const canFixZones = suggestions.length > 0 && zoneFixAllowed(detail.entry.state);
  if (detail.violations.length === 0 && unmatched.length === 0 && suggestions.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2 rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
      <span className="font-medium">Possible deck problems</span>
      <ul className="list-disc pl-5">
        {unmatched.length > 0 ? (
          <li>
            {unmatched.length} {unmatched.length === 1 ? "card" : "cards"} could not be matched to
            the catalog and cannot be validated.
          </li>
        ) : null}
        {suggestions.length > 0 ? (
          <li>
            {suggestions.length} {suggestions.length === 1 ? "card looks" : "cards look"} mis-zoned:
            their type belongs in a different zone than the import put them in.
          </li>
        ) : null}
        {detail.violations.map((violation) => (
          <li key={`${violation.zone}:${violation.code}:${violation.cardId ?? ""}`}>
            {violation.message}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        {unmatched.length > 0 ? (
          <Button
            size="sm"
            variant="outline"
            disabled={reResolve.isPending}
            title="Try matching the unidentified cards against the catalog again, e.g. after a catalog fix"
            onClick={async () => {
              const result = await reResolve.mutateAsync({ tournamentId });
              toast.info(
                result.updatedLines === 0
                  ? "No new matches found"
                  : `${result.updatedLines} ${result.updatedLines === 1 ? "line" : "lines"} now resolve`,
              );
              onResolved();
            }}
          >
            <RefreshCwIcon className="size-4" />
            Re-resolve cards
          </Button>
        ) : null}
        {canFixZones ? (
          <Button size="sm" variant="outline" onClick={() => setFixZonesOpen(true)}>
            <WandSparklesIcon className="size-4" />
            Fix zones
          </Button>
        ) : null}
      </div>
      {canFixZones ? (
        <FixZonesDialog
          tournamentId={tournamentId}
          entryId={detail.entry.id}
          suggestions={suggestions}
          open={fixZonesOpen}
          onOpenChange={setFixZonesOpen}
        />
      ) : null}
    </div>
  );
}

function FixZonesDialog({
  tournamentId,
  entryId,
  suggestions,
  open,
  onOpenChange,
}: {
  tournamentId: string;
  entryId: string;
  suggestions: DeckCheckEntryDetailResponse["zoneSuggestions"];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { zoneLabels } = useZoneOrder();
  const { printingsByCardId } = useCards();
  const applyZoneFixes = useApplyTournamentDeckCheckZoneFixes();
  // Every suggestion starts selected; a judge unticks any move that is
  // deliberate (e.g. a custom format that parks a card in a non-standard zone).
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(suggestions.map((suggestion) => suggestion.cardId)),
  );

  // The server-stored name is the bare catalog name; show the colloquial Legend
  // name ("Azir, Emperor of the Sands") from the catalog when we can resolve it.
  const displayNameFor = (suggestion: DeckCheckEntryDetailResponse["zoneSuggestions"][number]) => {
    const printing = printingsByCardId.get(suggestion.cardId)?.[0];
    return printing ? legendDisplayName(printing.card) : suggestion.cardName;
  };

  const handleApply = async () => {
    const cardIds = suggestions
      .map((suggestion) => suggestion.cardId)
      .filter((cardId) => selected.has(cardId));
    if (cardIds.length === 0) {
      return;
    }
    await applyZoneFixes.mutateAsync({ tournamentId, entryId, cardIds });
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          setSelected(new Set(suggestions.map((suggestion) => suggestion.cardId)));
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogForm onSubmit={() => void handleApply()}>
          <DialogHeader>
            <DialogTitle>Fix card zones</DialogTitle>
            <DialogDescription>
              Based on their type, these cards belong in a different zone than the import put them
              in. Untick any that are intentional, then apply the rest.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-2">
            {suggestions.map((suggestion) => (
              <li key={suggestion.cardId}>
                <Label className="hover:bg-muted/40 flex items-center gap-3 rounded-md p-2">
                  <Checkbox
                    checked={selected.has(suggestion.cardId)}
                    onCheckedChange={(checked: boolean) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (checked) {
                          next.add(suggestion.cardId);
                        } else {
                          next.delete(suggestion.cardId);
                        }
                        return next;
                      })
                    }
                  />
                  <span className="min-w-0 flex-1 truncate font-normal">
                    {displayNameFor(suggestion)}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-sm">
                    {zoneLabels[suggestion.currentZone]} → {zoneLabels[suggestion.suggestedZone]}
                  </span>
                </Label>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={applyZoneFixes.isPending || selected.size === 0}>
              {applyZoneFixes.isPending ? "Applying..." : `Move ${selected.size}`}
            </Button>
          </DialogFooter>
        </DialogForm>
      </DialogContent>
    </Dialog>
  );
}

function StatsSummary({ detail }: { detail: DeckCheckEntryDetailResponse }) {
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

/** The floating-preview payload built from a row's resolved printing. */
interface HoveredPreview {
  thumbnailUrl: string;
  fullUrl: string;
  landscape: boolean;
}

function CardChecklist({
  tournamentId,
  entryId,
  cards,
  displayMode,
  sortBy,
  sortDir,
  columns,
  cellWidth,
  locked,
  fixLocked,
  fixZoneOnly,
  tickLocked,
  onStale,
}: {
  tournamentId: string;
  entryId: string;
  cards: DeckCheckEntryCardResponse[];
  displayMode: DeckCheckDisplayMode;
  sortBy: DeckCheckSort;
  sortDir: "asc" | "desc";
  columns: number;
  cellWidth: number;
  /** Adding and removing cards are only allowed while submitted (ADR-027). */
  locked: boolean;
  /** Zone fixes are allowed while submitted, approved, or checked. */
  fixLocked: boolean;
  /** Once approved or checked, the fix dialog only moves zones (no re-identify). */
  fixZoneOnly: boolean;
  /** Found-ticks are frozen outside the submitted and approved (physical check) states. */
  tickLocked: boolean;
  onStale: () => void;
}) {
  const { zoneLabels } = useZoneOrder();
  const { orders } = useEnumOrders();
  const { allPrintings } = useCards();
  const isMobile = useIsMobile();
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<HoveredPreview | null>(null);

  const printingById = new Map(allPrintings.map((printing) => [printing.id, printing]));
  // Resolve catalogue identity for the "name" / "id" / "domain" / "energy" sorts.
  const identify = (printingId: string | null) => {
    const printing = printingId ? printingById.get(printingId) : undefined;
    return printing
      ? {
          name: printing.card.name,
          shortCode: printing.shortCode,
          domains: printing.card.domains,
          energy: printing.card.energy,
          power: printing.card.power,
        }
      : undefined;
  };

  // List rows float a large card image while hovered (desktop only); build the
  // preview payload from the row's resolved front image.
  const handleHover = (printing: Printing | null) => {
    const front = printing?.images.find((image) => image.face === "front");
    setHovered(
      printing && front
        ? {
            thumbnailUrl: imageUrl(front.imageId, "400w"),
            fullUrl: imageUrl(front.imageId, "full"),
            landscape: getOrientation(printing.card.types) === "landscape",
          }
        : null,
    );
  };

  const cardsByZone = Map.groupBy(cards, (card) => card.zone);
  const zoneCards = (zone: DeckCheckEntryCardResponse["zone"]) =>
    sortDeckCheckCards(cardsByZone.get(zone) ?? [], sortBy, sortDir, identify, orders.domains);

  // The small zones (one to three cards each) flow on a shared wrapping row,
  // so on wide screens legend, champion, and battlefields share one line and
  // fall onto separate lines only when they no longer fit.
  const flowZones = (
    [
      WellKnown.deckZone.LEGEND,
      WellKnown.deckZone.CHAMPION,
      WellKnown.deckZone.BATTLEFIELD,
    ] as const
  ).filter((zone) => cardsByZone.has(zone));
  const stackedZones = (
    [
      WellKnown.deckZone.MAIN,
      WellKnown.deckZone.SIDEBOARD,
      WellKnown.deckZone.OVERFLOW,
      WellKnown.deckZone.RUNES,
    ] as const
  ).filter((zone) => cardsByZone.has(zone));

  if (displayMode === "list") {
    // List view stacks every zone vertically — the flow/stacked split only
    // matters for the thumbnail grid's wrapping row.
    const orderedZones = [...flowZones, ...stackedZones];
    return (
      <div ref={previewContainerRef} className="relative flex flex-col gap-6">
        <HoveredCardPreview
          hoveredCard={isMobile ? null : hovered}
          origin="main"
          containerRef={previewContainerRef}
        />
        {orderedZones.map((zone) => (
          <ZoneSection
            key={zone}
            tournamentId={tournamentId}
            entryId={entryId}
            label={zoneLabels[zone]}
            cards={zoneCards(zone)}
            displayMode="list"
            printingById={printingById}
            onHover={handleHover}
            columns={columns}
            cellWidth={cellWidth}
            locked={locked}
            fixLocked={fixLocked}
            fixZoneOnly={fixZoneOnly}
            tickLocked={tickLocked}
            onStale={onStale}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {flowZones.length > 0 ? (
        <div className="flex flex-wrap gap-x-10 gap-y-6">
          {flowZones.map((zone) => (
            <ZoneSection
              key={zone}
              tournamentId={tournamentId}
              entryId={entryId}
              label={zoneLabels[zone]}
              cards={zoneCards(zone)}
              displayMode="grid"
              columns={columns}
              cellWidth={cellWidth}
              intrinsic
              locked={locked}
              fixLocked={fixLocked}
              fixZoneOnly={fixZoneOnly}
              tickLocked={tickLocked}
              onStale={onStale}
            />
          ))}
        </div>
      ) : null}
      {stackedZones.map((zone) => (
        <ZoneSection
          key={zone}
          tournamentId={tournamentId}
          entryId={entryId}
          label={zoneLabels[zone]}
          cards={zoneCards(zone)}
          displayMode="grid"
          columns={columns}
          cellWidth={cellWidth}
          locked={locked}
          fixLocked={fixLocked}
          fixZoneOnly={fixZoneOnly}
          tickLocked={tickLocked}
          onStale={onStale}
        />
      ))}
    </div>
  );
}

/** Active-state classes for the toolbar toggle groups (filled when pressed). */
const ACTIVE_TOGGLE_CLASS =
  "aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary aria-pressed:hover:text-primary-foreground";

function DisplayModeToggle({
  mode,
  onModeChange,
}: {
  mode: DeckCheckDisplayMode;
  onModeChange: (mode: DeckCheckDisplayMode) => void;
}) {
  return (
    <ToggleGroup
      aria-label="Display mode"
      variant="outline"
      spacing={0}
      value={[mode]}
      onValueChange={([next]) => {
        if (next === "grid" || next === "list") {
          onModeChange(next);
        }
      }}
    >
      <ToggleGroupItem
        value="grid"
        className={ACTIVE_TOGGLE_CLASS}
        title="Grid view"
        aria-label="Grid view"
      >
        <LayoutGridIcon className="size-4" />
      </ToggleGroupItem>
      <ToggleGroupItem
        value="list"
        className={ACTIVE_TOGGLE_CLASS}
        title="List view"
        aria-label="List view"
      >
        <Rows3Icon className="size-4" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

/** Gap between checker cells, matching the grid's `gap-3` (used in width math). */
const CHECK_GRID_GAP = 12;
/** Fallback rendered cell width before the grid has been measured. */
const CHECK_CELL_WIDTH = 172;

/** Card-line sort options exposed in the checker toolbar. */
const CHECK_SORT_OPTIONS: SortGroupOption<DeckCheckSort>[] = [
  { value: "deck", label: "Deck order" },
  { value: "id", label: "ID" },
  { value: "name", label: "Name" },
  { value: "domain", label: "Domain" },
  { value: "energy", label: "Energy" },
];

function ZoneSection({
  tournamentId,
  entryId,
  label,
  cards,
  displayMode,
  printingById,
  onHover,
  columns,
  cellWidth,
  intrinsic,
  locked,
  fixLocked,
  fixZoneOnly,
  tickLocked,
  onStale,
}: {
  tournamentId: string;
  entryId: string;
  label: string;
  cards: DeckCheckEntryCardResponse[];
  displayMode: DeckCheckDisplayMode;
  /** Printing lookup for resolving list-row names; only passed in list mode. */
  printingById?: Map<string, Printing>;
  /** Floating-preview hover callback; only passed in list mode. */
  onHover?: (printing: Printing | null) => void;
  /** Resolved cards-per-row count for the stacked (full-width) zones. */
  columns: number;
  /** Rendered width of one card, driving image sizing and intrinsic sections. */
  cellWidth: number;
  /** Content-sized section for the wrapping zone row. */
  intrinsic?: boolean;
  /** Locked outside the submitted state; hides the per-copy remove control. */
  locked: boolean;
  /** Locked outside submitted/approved/checked; hides the per-copy fix control. */
  fixLocked: boolean;
  /** Once approved or checked, the fix dialog only moves zones (no re-identify). */
  fixZoneOnly: boolean;
  /** Found-ticks frozen outside the submitted and approved (physical check) states. */
  tickLocked: boolean;
  onStale: () => void;
}) {
  const verifiedCopies = cards.reduce(
    (sum, card) => sum + card.foundCopies.filter(Boolean).length,
    0,
  );
  const totalCopies = cards.reduce((sum, card) => sum + card.quantity, 0);
  const done = totalCopies > 0 && verifiedCopies === totalCopies;

  const heading = (
    <h3
      className={cn(
        "flex items-center gap-1.5 text-sm font-medium tracking-wide uppercase",
        done ? "text-green-600" : "text-muted-foreground",
      )}
    >
      <span>{label}</span>
      <span>
        · {verifiedCopies}/{totalCopies}
      </span>
      {done ? <CheckIcon className="size-3.5" strokeWidth={3} /> : null}
    </h3>
  );

  if (displayMode === "list") {
    return (
      <section className="flex min-w-0 flex-col gap-1.5">
        {heading}
        <div className="flex flex-col">
          {cards.flatMap((card) =>
            Array.from({ length: card.quantity }, (_copy, copyIndex) => (
              <ChecklistRow
                key={`${card.id}:${copyIndex}`}
                tournamentId={tournamentId}
                entryId={entryId}
                card={card}
                copyIndex={copyIndex}
                printing={
                  card.resolvedPrintingId ? printingById?.get(card.resolvedPrintingId) : undefined
                }
                onHover={onHover}
                locked={locked}
                fixLocked={fixLocked}
                fixZoneOnly={fixZoneOnly}
                tickLocked={tickLocked}
                onStale={onStale}
              />
            )),
          )}
        </div>
      </section>
    );
  }

  // Flow zones size each card to `cellWidth`; stacked zones fill the row with
  // exactly `columns` equal tracks so the count matches the toolbar control.
  const intrinsicWidth = totalCopies * cellWidth + (totalCopies - 1) * CHECK_GRID_GAP;
  const gridTemplateColumns = intrinsic
    ? `repeat(auto-fill, minmax(min(${cellWidth}px, 100%), 1fr))`
    : `repeat(${columns}, minmax(0, 1fr))`;
  return (
    <section
      className="flex min-w-0 flex-col gap-2"
      style={intrinsic ? { width: `min(100%, ${intrinsicWidth}px)` } : undefined}
    >
      {heading}
      <div className="grid gap-3" style={{ gridTemplateColumns }}>
        {cards.flatMap((card) =>
          Array.from({ length: card.quantity }, (_copy, copyIndex) => (
            <ChecklistCell
              key={`${card.id}:${copyIndex}`}
              tournamentId={tournamentId}
              entryId={entryId}
              card={card}
              copyIndex={copyIndex}
              cellWidth={cellWidth}
              locked={locked}
              fixLocked={fixLocked}
              fixZoneOnly={fixZoneOnly}
              tickLocked={tickLocked}
              onStale={onStale}
            />
          )),
        )}
      </div>
    </section>
  );
}

/**
 * One physical copy of a card line as a dense text row: a found checkbox, set
 * code, name, and (for multi-copy lines) the copy number. Tapping the row
 * toggles found for that copy; remove and (for unmatched lines) fix sit at the
 * right. Hovering floats the large card image via the shared preview.
 * @returns The tappable copy row.
 */
function ChecklistRow({
  tournamentId,
  entryId,
  card,
  copyIndex,
  printing,
  onHover,
  locked,
  fixLocked,
  fixZoneOnly,
  tickLocked,
  onStale,
}: {
  tournamentId: string;
  entryId: string;
  card: DeckCheckEntryCardResponse;
  copyIndex: number;
  printing?: Printing;
  onHover?: (printing: Printing | null) => void;
  /** Locked outside the submitted state; hides the per-copy remove control. */
  locked: boolean;
  /** Locked outside submitted/approved/checked; hides the fix control. */
  fixLocked: boolean;
  /** Once approved or checked, the fix dialog only moves zones (no re-identify). */
  fixZoneOnly: boolean;
  /** Ticking frozen outside the submitted and approved (physical check) states. */
  tickLocked: boolean;
  onStale: () => void;
}) {
  const tickCard = useTickTournamentDeckCheckCard();
  const removeCard = useRemoveTournamentDeckCheckCard();
  const [removeOpen, setRemoveOpen] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const found = card.foundCopies[copyIndex] === true;
  const matched = printing !== undefined && card.matchStatus === "matched";
  const name = matched ? legendDisplayName(printing.card) : card.rawName;

  const toggle = async () => {
    // Ticking is the physical check; allowed while submitted or approved, frozen otherwise.
    if (tickLocked) {
      return;
    }
    try {
      await tickCard.mutateAsync({
        tournamentId,
        entryId,
        cardId: card.id,
        copyIndex,
        found: !found,
      });
    } catch {
      toast.info("This list changed, reloading now");
      onStale();
    }
  };

  return (
    <div
      className="hover:bg-muted/40 flex items-center gap-2 rounded-md"
      onMouseEnter={() => {
        if (matched) {
          onHover?.(printing);
        }
      }}
      onMouseLeave={() => onHover?.(null)}
    >
      <Pressable
        onClick={() => void toggle()}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-2 py-1.5"
      >
        <span
          aria-hidden
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded border",
            found ? "border-green-600 bg-green-600 text-white" : "border-input",
          )}
        >
          {found ? <CheckIcon className="size-3.5" strokeWidth={3} /> : null}
        </span>
        {matched ? (
          <span className="text-muted-foreground w-24 shrink-0 text-sm tabular-nums">
            {printing.shortCode}
          </span>
        ) : null}
        <span
          className={cn("min-w-0 flex-1 truncate", found && "text-muted-foreground line-through")}
        >
          {name}
        </span>
        {matched ? null : (
          <span className="text-muted-foreground shrink-0 text-sm">
            {card.matchStatus === "ambiguous" ? "Several matches" : "Not in catalog"}
          </span>
        )}
        {card.quantity > 1 ? (
          <span className="text-muted-foreground text-2xs shrink-0">copy {copyIndex + 1}</span>
        ) : null}
      </Pressable>
      {fixLocked && locked ? null : (
        <div className="flex shrink-0 items-center gap-0.5 pr-1">
          {fixLocked ? null : (
            <>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={fixZoneOnly ? `Move ${name}` : `Fix ${name}`}
                className="text-muted-foreground"
                onClick={() => setFixOpen(true)}
              >
                <PencilIcon className="size-3.5" />
              </Button>
              <FixCardDialog
                tournamentId={tournamentId}
                entryId={entryId}
                card={card}
                open={fixOpen}
                onOpenChange={setFixOpen}
                zoneOnly={fixZoneOnly}
              />
            </>
          )}
          {locked ? null : (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove this copy of ${card.rawName}`}
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setRemoveOpen(true)}
            >
              <XIcon className="size-3.5" />
            </Button>
          )}
        </div>
      )}
      <ConfirmActionDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={`Remove ${card.rawName}?`}
        description={
          card.quantity > 1
            ? "Only this copy is removed from the list."
            : "The card is removed from this list."
        }
        confirmLabel="Remove"
        pendingLabel="Removing..."
        isPending={removeCard.isPending}
        onConfirm={async () => {
          await removeCard.mutateAsync({ tournamentId, entryId, cardId: card.id, copyIndex });
          setRemoveOpen(false);
        }}
      />
    </div>
  );
}

/**
 * One physical copy of a card line. A line with quantity 3 renders three
 * cells — the deck on the table is unsorted, so the judge finds copies one at
 * a time. Each cell carries its own found tick, so the cell you tap is the
 * one that lights up.
 * @returns The tappable copy cell.
 */
function ChecklistCell({
  tournamentId,
  entryId,
  card,
  copyIndex,
  cellWidth,
  locked,
  fixLocked,
  fixZoneOnly,
  tickLocked,
  onStale,
}: {
  tournamentId: string;
  entryId: string;
  card: DeckCheckEntryCardResponse;
  copyIndex: number;
  cellWidth: number;
  /** Locked outside the submitted state; hides the remove control. */
  locked: boolean;
  /** Locked outside submitted/approved/checked; hides the fix control. */
  fixLocked: boolean;
  /** Once approved or checked, the fix dialog only moves zones (no re-identify). */
  fixZoneOnly: boolean;
  /** Ticking frozen outside the submitted and approved (physical check) states. */
  tickLocked: boolean;
  onStale: () => void;
}) {
  const { allPrintings } = useCards();
  const display = useCardThumbnailDisplay();
  const tickCard = useTickTournamentDeckCheckCard();
  const removeCard = useRemoveTournamentDeckCheckCard();
  const [removeOpen, setRemoveOpen] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const found = card.foundCopies[copyIndex] === true;

  const toggle = async () => {
    // Ticking is the physical check; allowed while submitted or approved, frozen otherwise.
    if (tickLocked) {
      return;
    }
    try {
      await tickCard.mutateAsync({
        tournamentId,
        entryId,
        cardId: card.id,
        copyIndex,
        found: !found,
      });
    } catch {
      // A 409 means the list was re-imported under us; reload the entry.
      toast.info("This list changed, reloading now");
      onStale();
    }
  };

  const foundOverlay = found ? (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="bg-background/80 rounded-full p-3 shadow-md">
        <CheckIcon className="size-12 text-green-600" strokeWidth={3} />
      </div>
    </div>
  ) : null;

  // Fix / remove live in a bar above the card (not overlaid on the image), so
  // the controls stay fully tappable on touch instead of fighting the cell's
  // tap-to-tick handler. Mirrors the deck editor's DeckAddStrip placement.
  const actionStrip =
    fixLocked && locked ? null : (
      <>
        <CardStrip
          right={
            <>
              {fixLocked ? null : (
                <StripIconButton
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={fixZoneOnly ? `Move ${card.rawName}` : `Fix ${card.rawName}`}
                  onClick={() => setFixOpen(true)}
                >
                  <PencilIcon />
                </StripIconButton>
              )}
              {locked ? null : (
                <StripIconButton
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remove this copy of ${card.rawName}`}
                  onClick={() => setRemoveOpen(true)}
                >
                  <XIcon />
                </StripIconButton>
              )}
            </>
          }
        />
        {fixLocked ? null : (
          <FixCardDialog
            tournamentId={tournamentId}
            entryId={entryId}
            card={card}
            open={fixOpen}
            onOpenChange={setFixOpen}
            zoneOnly={fixZoneOnly}
          />
        )}
        {locked ? null : (
          <ConfirmActionDialog
            open={removeOpen}
            onOpenChange={setRemoveOpen}
            title={`Remove ${card.rawName}?`}
            description={
              card.quantity > 1
                ? "Only this copy is removed from the list."
                : "The card is removed from this list."
            }
            confirmLabel="Remove"
            pendingLabel="Removing..."
            isPending={removeCard.isPending}
            onConfirm={async () => {
              await removeCard.mutateAsync({ tournamentId, entryId, cardId: card.id, copyIndex });
              setRemoveOpen(false);
            }}
          />
        )}
      </>
    );

  const printing = card.resolvedPrintingId
    ? allPrintings.find((candidate) => candidate.id === card.resolvedPrintingId)
    : undefined;

  if (!printing || card.matchStatus !== "matched") {
    return (
      <div>
        {actionStrip}
        <div className="relative">
          <Pressable
            onClick={() => void toggle()}
            className={cn(
              "flex h-full w-full flex-col items-start gap-1 rounded-md border border-dashed border-amber-500/60 bg-amber-500/10 p-2 text-sm",
              found && "opacity-60",
            )}
          >
            <span className="font-medium break-all">{card.rawName}</span>
            <span className="text-muted-foreground">
              {card.matchStatus === "ambiguous" ? "Several matches" : "Not in catalog"}
            </span>
          </Pressable>
          {foundOverlay}
        </div>
      </div>
    );
  }

  return (
    <CardCell
      printing={printing}
      ctx={{ isSelected: false, isFlashing: false, cardWidth: cellWidth, priority: false }}
      display={display}
      showImages
      onClick={() => void toggle()}
      strip={actionStrip}
      leftOverlay={foundOverlay}
      dimmed={found}
    />
  );
}
