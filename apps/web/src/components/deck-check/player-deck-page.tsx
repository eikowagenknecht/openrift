import type {
  DeckCheckEntryCardResponse,
  PlayerDeckCheckEntryDetailResponse,
} from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { TriangleAlertIcon } from "lucide-react";
import { useState } from "react";

import { CardCell } from "@/components/cards/card-cell";
import { useCardThumbnailDisplay } from "@/components/cards/card-thumbnail";
import { DeckCheckCardZonesSkeleton } from "@/components/deck-check/deck-check-skeletons";
import { PlayerDeckSourceForm } from "@/components/deck-check/player-deck-source-form";
import type { DeckSourceInput } from "@/components/deck-check/player-deck-source-form";
import { PlayerStateBadge } from "@/components/deck-check/player-decks-page";
import { DeckDomainBar } from "@/components/deck/deck-domain-bar";
import { FormatStateBadge, typeCountSummary } from "@/components/deck/deck-tile";
import {
  PAGE_TOP_BAR_STICKY,
  PageTopBar,
  PageTopBarActions,
  PageTopBarBack,
  PageTopBarButton,
  PageTopBarPrimaryButton,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useCards } from "@/hooks/use-cards";
import {
  useCancelUnlockRequest,
  useEditMyTournamentDeck,
  useMyTournamentDeck,
  usePreviewTournamentDeck,
  useSubmitMyTournamentDeck,
  useUnlockMyTournamentDeck,
} from "@/hooks/use-deck-check-player";
import { useZoneOrder } from "@/hooks/use-enums";
import { formatAbsoluteDate } from "@/lib/format-date";
import { PAGE_PADDING } from "@/lib/utils";

/** Rendered width of one card in the read-only grid. */
const PLAYER_CELL_WIDTH = 150;

/**
 * One tournament deck, rendered for its player (ADR-026/027): the list by
 * zone, the lifecycle state, the judge's player-facing message, and the
 * state-dependent actions (edit and submit while editable, unlock when
 * submitted, request an unlock when approved). Never any other entrant,
 * never judge notes.
 * @returns The page.
 */
export function PlayerDeckPage({ entryId }: { entryId: string }) {
  const { data, isPending, isError } = useMyTournamentDeck(entryId);

  if (isPending) {
    return (
      <div>
        <div className={PAGE_TOP_BAR_STICKY}>
          <div className="mx-auto w-full max-w-5xl">
            <PageTopBar>
              <PageTopBarBack to="/tournaments/my-decks" aria-label="Back to my tournament decks" />
              <Skeleton className="h-5 w-44" />
            </PageTopBar>
          </div>
        </div>
        <div className={`flex justify-center ${PAGE_PADDING}`}>
          <div className="flex w-full max-w-5xl flex-col gap-4">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-2 w-full" />
            <DeckCheckCardZonesSkeleton cellWidth={PLAYER_CELL_WIDTH} />
          </div>
        </div>
      </div>
    );
  }
  if (isError || !data) {
    return <p className="text-muted-foreground p-6 text-center">This deck is not available.</p>;
  }

  const { entry } = data;
  const eventDate = entry.eventDate
    ? formatAbsoluteDate(entry.eventDate, { year: "numeric", month: "short", day: "numeric" })
    : null;
  const closesAt = entry.submissionsCloseAt
    ? formatAbsoluteDate(entry.submissionsCloseAt, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div>
      <div className={PAGE_TOP_BAR_STICKY}>
        <div className="mx-auto w-full max-w-5xl">
          <PageTopBar>
            <PageTopBarBack to="/tournaments/my-decks" aria-label="Back to my tournament decks" />
            <PageTopBarTitle>{entry.eventName}</PageTopBarTitle>
            <PageTopBarActions>
              <PlayerDeckActions entry={entry} />
            </PageTopBarActions>
          </PageTopBar>
        </div>
      </div>
      <div className={`flex justify-center ${PAGE_PADDING}`}>
        <div className="flex w-full max-w-5xl flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-sm">
              {[entry.groupName, eventDate].filter(Boolean).join(" · ")}
            </span>
            <span className="flex-1" />
            {entry.reviewOutcome === "issue" && entry.state === "editable" ? (
              <Badge variant="destructive">Changes requested</Badge>
            ) : null}
            {entry.unlockRequested ? <Badge variant="outline">Unlock requested</Badge> : null}
            <PlayerStateBadge state={entry.state} reviewOutcome={entry.reviewOutcome} />
          </div>

          {entry.state === "withdrawn" ? (
            <Banner>
              Your entry was withdrawn by the organizer. If that is unexpected, contact a judge.
            </Banner>
          ) : null}
          {entry.playerMessage ? (
            <div className="bg-muted/50 rounded-md border p-3 text-sm">
              <p className="text-muted-foreground mb-1 font-medium">Message from the judges</p>
              <p className="whitespace-pre-wrap">{entry.playerMessage}</p>
            </div>
          ) : null}
          {entry.state === "editable" && entry.windowOpen ? (
            <Banner>
              This deck is not submitted yet. Submit it for review
              {closesAt ? ` before ${closesAt}` : ""} — an unsubmitted list is sent in as-is when
              submissions close.
            </Banner>
          ) : null}
          {entry.state === "submitted" && entry.windowOpen ? (
            <p className="text-muted-foreground text-sm">
              {entry.canUnlock
                ? `Your deck is locked for review. You can unlock it to make changes${closesAt ? ` until ${closesAt}` : ""}; a judge then reviews the new list.`
                : entry.unlockRequested
                  ? "Your unlock request is waiting for a judge. Once granted, you can edit and resubmit your deck."
                  : "Your deck is submitted and locked. To change it, request an unlock — a judge has to grant it."}
            </p>
          ) : null}
          {entry.state === "approved" && entry.windowOpen ? (
            <p className="text-muted-foreground text-sm">
              {entry.unlockRequested
                ? "Your unlock request is waiting for a judge. Once granted, you can edit and resubmit your deck."
                : "A judge approved your deck. To change it, request an unlock — a judge has to grant it."}
            </p>
          ) : null}
          {!entry.windowOpen && entry.state !== "withdrawn" && entry.state !== "checked" ? (
            <p className="text-muted-foreground text-sm">
              Submissions are closed. Contact a judge to change your list.
            </p>
          ) : null}
          <p className="text-muted-foreground text-sm">
            {sharingSummary(
              entry.allowDeckPublishing,
              entry.allowNameSharing,
              entry.allowRiotIdSharing,
            )}
            {entry.canEdit ? " You can change this when replacing your deck." : ""}
          </p>
          {data.violations.length > 0 ? (
            <Banner>
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {data.violations.map((violation) => (
                  <li key={`${violation.zone}:${violation.code}:${violation.cardId ?? ""}`}>
                    {violation.message}
                  </li>
                ))}
              </ul>
            </Banner>
          ) : null}

          <DeckMetaSummary data={data} />
          <PlayerCardGrid cards={data.cards} />
        </div>
      </div>
    </div>
  );
}

/**
 * One sentence describing what the player allows public platforms to show.
 * @returns The summary sentence.
 */
function sharingSummary(allowPublish: boolean, allowName: boolean, allowRiotId: boolean): string {
  if (!allowPublish) {
    return "The organizer may not publish this deck list publicly.";
  }
  if (allowName && allowRiotId) {
    return "The organizer may publish this deck list, with your name and Riot ID.";
  }
  if (allowName) {
    return "The organizer may publish this deck list, with your name but not your Riot ID.";
  }
  if (allowRiotId) {
    return "The organizer may publish this deck list, with your Riot ID but not your name.";
  }
  return "The organizer may publish this deck list, without your name or Riot ID.";
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-500/60 bg-amber-500/10 p-3 text-sm">
      <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function DeckMetaSummary({ data }: { data: PlayerDeckCheckEntryDetailResponse }) {
  const typeSummary = typeCountSummary(data.typeCounts);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        {typeSummary ? (
          <span className="text-muted-foreground text-2xs">{typeSummary}</span>
        ) : (
          <span />
        )}
        {data.entry.format ? (
          <FormatStateBadge format={data.entry.format} isValid={data.violations.length === 0} />
        ) : null}
      </div>
      {data.domainDistribution.length > 0 ? (
        <DeckDomainBar distribution={data.domainDistribution} />
      ) : null}
    </div>
  );
}

/**
 * Read-only zone-grouped card grid; one cell per line with a quantity chip.
 * @returns The grid.
 */
function PlayerCardGrid({ cards }: { cards: DeckCheckEntryCardResponse[] }) {
  const { zoneLabels } = useZoneOrder();
  const cardsByZone = Map.groupBy(cards, (card) => card.zone);
  const zones = (
    [
      WellKnown.deckZone.LEGEND,
      WellKnown.deckZone.CHAMPION,
      WellKnown.deckZone.BATTLEFIELD,
      WellKnown.deckZone.MAIN,
      WellKnown.deckZone.SIDEBOARD,
      WellKnown.deckZone.OVERFLOW,
      WellKnown.deckZone.RUNES,
    ] as const
  ).filter((zone) => cardsByZone.has(zone));

  return (
    <div className="flex flex-col gap-6">
      {zones.map((zone) => {
        const zoneCards = (cardsByZone.get(zone) ?? []).toSorted(
          (left, right) => left.sortOrder - right.sortOrder,
        );
        const copies = zoneCards.reduce((sum, card) => sum + card.quantity, 0);
        return (
          <section key={zone} className="flex min-w-0 flex-col gap-2">
            <h3 className="text-muted-foreground text-sm font-medium tracking-wide uppercase">
              {zoneLabels[zone]} · {copies}
            </h3>
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(min(${PLAYER_CELL_WIDTH}px, 100%), 1fr))`,
              }}
            >
              {zoneCards.flatMap((card) =>
                Array.from({ length: card.quantity }, (_copy, copyIndex) => (
                  <PlayerCardCell key={`${card.id}:${copyIndex}`} card={card} />
                )),
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function PlayerCardCell({ card }: { card: DeckCheckEntryCardResponse }) {
  const { allPrintings } = useCards();
  const display = useCardThumbnailDisplay();

  const printing = card.resolvedPrintingId
    ? allPrintings.find((candidate) => candidate.id === card.resolvedPrintingId)
    : undefined;

  if (!printing || card.matchStatus !== "matched") {
    return (
      <div className="flex h-full w-full flex-col items-start gap-1 rounded-md border border-dashed border-amber-500/60 bg-amber-500/10 p-2 text-left text-sm">
        <span className="font-medium break-all">{card.rawName}</span>
        <span className="text-muted-foreground">
          {card.matchStatus === "ambiguous" ? "Several matches" : "Not in catalog"}
        </span>
      </div>
    );
  }

  return (
    <CardCell
      printing={printing}
      ctx={{ isSelected: false, isFlashing: false, cardWidth: PLAYER_CELL_WIDTH, priority: false }}
      display={display}
      showImages
      // oxlint-disable-next-line no-empty-function -- read-only cell, clicks do nothing
      onClick={() => {}}
    />
  );
}

/**
 * The state-dependent top-bar actions (ADR-027): replace + submit while
 * editable, unlock while submitted, request (or cancel) an unlock while
 * approved. Nothing once checked, withdrawn, or after the deadline.
 * @returns The action buttons, or null.
 */
function PlayerDeckActions({ entry }: { entry: PlayerDeckCheckEntryDetailResponse["entry"] }) {
  const submit = useSubmitMyTournamentDeck();
  const unlock = useUnlockMyTournamentDeck();
  const cancelRequest = useCancelUnlockRequest();

  if (!entry.windowOpen) {
    return null;
  }
  if (entry.state === "editable") {
    return (
      <>
        <ReplaceDeckButton
          entryId={entry.id}
          allowDeckPublishing={entry.allowDeckPublishing}
          allowNameSharing={entry.allowNameSharing}
          allowRiotIdSharing={entry.allowRiotIdSharing}
        />
        <PageTopBarPrimaryButton
          disabled={submit.isPending}
          onClick={() => submit.mutate(entry.id)}
        >
          Submit for review
        </PageTopBarPrimaryButton>
      </>
    );
  }
  if (entry.canUnlock) {
    return (
      <PageTopBarButton disabled={unlock.isPending} onClick={() => unlock.mutate(entry.id)}>
        Unlock to edit
      </PageTopBarButton>
    );
  }
  if (entry.unlockRequested) {
    return (
      <PageTopBarButton
        disabled={cancelRequest.isPending}
        onClick={() => cancelRequest.mutate(entry.id)}
      >
        Cancel unlock request
      </PageTopBarButton>
    );
  }
  if (entry.canRequestUnlock) {
    return (
      <PageTopBarButton disabled={unlock.isPending} onClick={() => unlock.mutate(entry.id)}>
        Request unlock
      </PageTopBarButton>
    );
  }
  return null;
}

function ReplaceDeckButton({
  entryId,
  allowDeckPublishing,
  allowNameSharing,
  allowRiotIdSharing,
}: {
  entryId: string;
  allowDeckPublishing: boolean;
  allowNameSharing: boolean;
  allowRiotIdSharing: boolean;
}) {
  const [open, setOpen] = useState(false);
  const edit = useEditMyTournamentDeck();
  const preview = usePreviewTournamentDeck();

  const submit = async (input: DeckSourceInput) => {
    await edit.mutateAsync({ entryId, ...input });
    preview.reset();
    setOpen(false);
  };

  return (
    <>
      <PageTopBarButton onClick={() => setOpen(true)}>Replace deck</PageTopBarButton>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace your deck</DialogTitle>
            <DialogDescription>
              The new list replaces the current one. It counts only once you submit it for review.
            </DialogDescription>
          </DialogHeader>
          <PlayerDeckSourceForm
            submitLabel="Replace deck"
            pendingLabel="Replacing..."
            isSubmitting={edit.isPending}
            onSubmit={(input) => void submit(input)}
            onPreview={(input) => preview.mutate({ entryId, ...input })}
            preview={preview.data ?? null}
            isPreviewing={preview.isPending}
            initialAllowDeckPublishing={allowDeckPublishing}
            initialAllowNameSharing={allowNameSharing}
            initialAllowRiotIdSharing={allowRiotIdSharing}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
