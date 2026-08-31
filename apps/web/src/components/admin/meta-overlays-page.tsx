import { formatDay, formatRelativeTime } from "@openrift/shared";
import type { MetaOverlayQueueRow } from "@openrift/shared";
import { ArchiveXIcon, CheckIcon, LinkIcon, UploadIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { MetaCardNamePicker } from "@/components/admin/meta-card-name-picker";
import { MetaEventCorrectionsPanel } from "@/components/admin/meta-event-corrections-panel";
import { MetaIgnoredSourcesDialog } from "@/components/admin/meta-ignored-sources-dialog";
import { MetaOverlayUploadDialog } from "@/components/admin/meta-overlay-upload-dialog";
import { ConfirmActionButton, ReviewDisclosure } from "@/components/admin/meta-review-shared";
import { MetaSubmissionResolve } from "@/components/admin/meta-submission-resolve";
import { PageDescription, PageTopBarButton } from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAcceptMetaEventOverlay,
  useAcceptMetaPlayerOverlay,
  useAdminMetaOverlays,
  useIgnoreMetaSourceEvent,
  useIgnoreMetaSourcePlayer,
  useLinkMetaPlayerOverlay,
  useMetaEventMatchSuggestions,
  useMetaPlayerMatchSuggestions,
  useRejectMetaOverlay,
} from "@/hooks/use-admin-meta-overlays";
import { useMetaSubmissionForPlayerOverlay } from "@/hooks/use-admin-meta-submissions";
import { sourceDismissTarget, sourceProviderDisplay } from "@/lib/meta-source-review";

// The overlay queue (ADR-014 revision 3). It is short by design: an admin's own
// corrections are born accepted and never land here, which is what lets every
// row fetch its own match suggestions.

function ChangeList({ changes }: { changes: MetaOverlayQueueRow["changes"] }) {
  if (changes.length === 0) {
    return <p className="text-muted-foreground">No field changes.</p>;
  }
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
      {changes.map((change) => (
        <div key={change.field} className="contents">
          <dt className="text-muted-foreground font-mono text-sm">{change.field}</dt>
          <dd className="flex flex-wrap items-baseline gap-2">
            <span className="text-muted-foreground line-through">{change.from ?? "empty"}</span>
            <span aria-hidden>→</span>
            <span className="font-medium">{change.to ?? "empty"}</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A submitted decklist. Promotion attaches a deck only when every line
 * resolves, so the unmatched names lead, each with the picker that fixes it.
 *
 * @returns The card lines, or null for an overlay claiming none.
 */
function CardLines({ overlay }: { overlay: MetaOverlayQueueRow }) {
  if (overlay.cards.length === 0) {
    return null;
  }
  return (
    <div className="space-y-2">
      {overlay.unresolvedNames.length > 0 && (
        <div className="space-y-2">
          <p className="text-destructive">
            {overlay.unresolvedNames.length} card{overlay.unresolvedNames.length === 1 ? "" : "s"}{" "}
            match nothing in the catalog, so no deck is attached until they do.
          </p>
          <ul className="space-y-1">
            {overlay.unresolvedNames.map((name) => (
              <li key={name} className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{name}</span>
                <MetaCardNamePicker name={name} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul className="grid gap-1 sm:grid-cols-2">
        {overlay.cards.map((card) => (
          <li key={card.lineNumber} className="flex items-baseline gap-2">
            <span className="text-muted-foreground tabular-nums">{card.quantity}×</span>
            <span className={card.cardId === null ? "text-destructive" : undefined}>
              {card.cardName}
            </span>
            <Badge variant="outline">{card.zone}</Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The live events a proposal might already be. Shown without asking, because a
 * duplicate is only avoidable before Accept is clicked.
 *
 * @returns The ranked matches, or why there are none.
 */
function EventMatches({
  overlayId,
  busy,
  onAcceptInto,
}: {
  overlayId: string;
  busy: boolean;
  onAcceptInto: (metaEventId: string) => void;
}) {
  const { data, isPending } = useMetaEventMatchSuggestions(overlayId);

  if (isPending) {
    return <Skeleton className="h-16 w-full" />;
  }
  if (data === undefined) {
    return null;
  }
  if (data.suggestions.length === 0) {
    return (
      <p className="text-muted-foreground">
        No archived event within {data.windowDays} day{data.windowDays === 1 ? "" : "s"} looks like
        this one, so accepting mints a new one.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground">
        The archive already holds these, within {data.windowDays} day
        {data.windowDays === 1 ? "" : "s"}. Accept into one rather than minting a duplicate.
      </p>
      <ul className="space-y-1">
        {data.suggestions.map((suggestion) => (
          <li key={suggestion.metaEventId} className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{suggestion.name}</span>
            <span className="text-muted-foreground tabular-nums">
              {formatDay(suggestion.eventDate)}
            </span>
            <Badge variant="outline">{suggestion.format}</Badge>
            <span className="text-muted-foreground">{suggestion.reasons.join(", ")}</span>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                onAcceptInto(suggestion.metaEventId);
              }}
            >
              <CheckIcon />
              Accept into this
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The standings rows a loose overlay might describe. Only ever mounted for one
 * that names no row yet, so the request is never made for nothing.
 *
 * @returns The link disclosure.
 */
function PlayerMatches({ overlayId }: { overlayId: string }) {
  const [open, setOpen] = useState(false);
  const { data, isPending } = useMetaPlayerMatchSuggestions(overlayId, open);
  const link = useLinkMetaPlayerOverlay();

  async function handleLink(metaEventPlayerId: string, playerName: string): Promise<void> {
    try {
      await link.mutateAsync({ id: overlayId, metaEventPlayerId });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    toast.success(`Linked to ${playerName}.`);
  }

  return (
    <ReviewDisclosure title="Link to a standings row" onOpenChange={setOpen}>
      {isPending && <Skeleton className="h-16 w-full" />}
      {data !== undefined && data.suggestions.length === 0 && (
        <p className="text-muted-foreground">
          No standings row in this event reads as the same player, so accepting files a new one.
        </p>
      )}
      {data !== undefined && data.suggestions.length > 0 && (
        <ul className="space-y-1">
          {data.suggestions.map((suggestion) => (
            <li key={suggestion.metaEventPlayerId} className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground tabular-nums">
                {suggestion.rankIsTier ? `T${suggestion.rank}` : suggestion.rank}
              </span>
              <span className="font-medium">{suggestion.playerName}</span>
              {suggestion.deckId !== null && <Badge variant="outline">has a deck</Badge>}
              <span className="text-muted-foreground">{suggestion.reasons.join(", ")}</span>
              <Button
                size="sm"
                variant="outline"
                disabled={link.isPending}
                onClick={() => {
                  void handleLink(suggestion.metaEventPlayerId, suggestion.playerName);
                }}
              >
                <LinkIcon />
                Link to this entry
              </Button>
            </li>
          ))}
        </ul>
      )}
    </ReviewDisclosure>
  );
}

/**
 * Skips this row's source key from now on. Rejecting settles the overlay in
 * front of us; dismissing is the answer to a source that will keep producing
 * it, so the two sit side by side rather than one standing in for the other.
 *
 * @returns The dismiss button and its confirmation, or null for a row carrying
 *   no source key.
 */
function DismissSourceKey({ overlay }: { overlay: MetaOverlayQueueRow }) {
  const ignoreEvent = useIgnoreMetaSourceEvent();
  const ignorePlayer = useIgnoreMetaSourcePlayer();
  const target = sourceDismissTarget(overlay);

  if (target === null) {
    return null;
  }

  const description =
    target.kind === "event"
      ? `Every crawl and upload skips ${target.provider}'s "${target.externalId}" from now on. You can undo it under Dismissed keys.`
      : `Every crawl and upload skips ${target.provider}'s "${target.externalId}" in event "${target.eventExternalId}" from now on. You can undo it under Dismissed keys.`;

  async function dismiss(): Promise<void> {
    if (target === null) {
      return;
    }
    if (target.kind === "event") {
      await ignoreEvent.mutateAsync({
        provider: target.provider,
        externalId: target.externalId,
      });
      return;
    }
    await ignorePlayer.mutateAsync({
      provider: target.provider,
      eventExternalId: target.eventExternalId,
      externalId: target.externalId,
    });
  }

  return (
    <ConfirmActionButton
      title="Dismiss this source key?"
      description={description}
      confirmLabel="Dismiss"
      onConfirm={dismiss}
      disabled={ignoreEvent.isPending || ignorePlayer.isPending}
      trigger={<Button variant="outline" />}
    >
      <ArchiveXIcon />
      Dismiss this source key
    </ConfirmActionButton>
  );
}

/**
 * The ledger row behind a person's overlay, so a decklist that is not taken can
 * be stamped with an outcome its contributor reads.
 */
function SubmissionLedger({ overlay }: { overlay: MetaOverlayQueueRow }) {
  const isPerson = overlay.provider === null;
  const { data } = useMetaSubmissionForPlayerOverlay(overlay.id, isPerson);
  const submission = data?.submission ?? null;
  if (submission === null) {
    return null;
  }
  return (
    <div className="border-t pt-2">
      <MetaSubmissionResolve submission={submission} playerOverlayId={overlay.id} />
    </div>
  );
}

function OverlayCard({ overlay }: { overlay: MetaOverlayQueueRow }) {
  const acceptEvent = useAcceptMetaEventOverlay();
  const acceptPlayer = useAcceptMetaPlayerOverlay();
  const reject = useRejectMetaOverlay();
  const [confirming, setConfirming] = useState(false);
  const busy = acceptEvent.isPending || acceptPlayer.isPending || reject.isPending;

  const title =
    overlay.kind === "event"
      ? (overlay.metaEventName ?? overlay.proposedName ?? "Proposed event")
      : (overlay.playerName ?? "Standings entry");
  const isProposal = overlay.kind === "event" && overlay.metaEventId === null;
  // A null provider is a person, which is what the "usersubmission" slug names.
  const provider = sourceProviderDisplay(overlay.provider ?? "usersubmission");

  async function accept(metaEventId: string | null): Promise<void> {
    const run =
      overlay.kind === "event"
        ? () => acceptEvent.mutateAsync({ id: overlay.id, metaEventId })
        : () => acceptPlayer.mutateAsync(overlay.id);
    try {
      await run();
    } catch {
      setConfirming(false);
      // Reported by the global mutation error toast.
      return;
    }
    toast.success("Applied.");
  }

  // Accepting a list with names the catalog does not know produces a standings
  // row and no deck, which is easy to do by accident and hard to notice after.
  function onAccept(metaEventId: string | null): void {
    if (overlay.unresolvedNames.length > 0 && !confirming) {
      setConfirming(true);
      return;
    }
    void accept(metaEventId);
  }

  async function decline(): Promise<void> {
    try {
      await reject.mutateAsync({ kind: overlay.kind, id: overlay.id });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    toast.success("Rejected.");
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="font-medium">{title}</h2>
          <Badge variant={overlay.kind === "event" ? "default" : "secondary"}>{overlay.kind}</Badge>
          <Badge variant={provider.variant}>{provider.label}</Badge>
          {isProposal && <Badge variant="outline">new event</Badge>}
          {overlay.kind === "player" && overlay.metaEventPlayerId !== null && (
            <Badge variant="muted">
              <LinkIcon />
              linked
            </Badge>
          )}
          {overlay.unresolvedNames.length > 0 && (
            <Badge variant="destructive">{overlay.unresolvedNames.length} unmatched</Badge>
          )}
        </div>
        <span className="text-muted-foreground">
          {formatRelativeTime(new Date(overlay.createdAt))}
        </span>
      </div>

      {overlay.submissionNote !== null && (
        <p className="text-muted-foreground italic">{overlay.submissionNote}</p>
      )}

      <ChangeList changes={overlay.changes} />
      <CardLines overlay={overlay} />

      {isProposal && <EventMatches overlayId={overlay.id} busy={busy} onAcceptInto={onAccept} />}
      {overlay.kind === "player" && overlay.metaEventPlayerId === null && (
        <PlayerMatches overlayId={overlay.id} />
      )}

      <div className="flex items-center gap-2">
        <Button
          onClick={() => {
            onAccept(null);
          }}
          disabled={busy}
        >
          <CheckIcon />
          {confirming ? "Accept without a deck" : "Accept"}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            void decline();
          }}
          disabled={busy}
        >
          <XIcon />
          Reject
        </Button>
        <DismissSourceKey overlay={overlay} />
        {confirming && (
          <span className="text-muted-foreground">
            {overlay.unresolvedNames.length} card
            {overlay.unresolvedNames.length === 1 ? "" : "s"} match nothing, so this lands as a
            standings row with no decklist.
          </span>
        )}
      </div>

      {overlay.kind === "player" && <SubmissionLedger overlay={overlay} />}
    </Card>
  );
}

export function MetaOverlaysPage() {
  const { data } = useAdminMetaOverlays();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [ignoredOpen, setIgnoredOpen] = useState(false);

  return (
    <div className="space-y-4">
      <AdminPageTopBar
        title="Overlays"
        actions={
          <>
            <PageTopBarButton
              onClick={() => {
                setIgnoredOpen(true);
              }}
            >
              Dismissed keys
            </PageTopBarButton>
            <PageTopBarButton
              onClick={() => {
                setUploadOpen(true);
              }}
            >
              <UploadIcon />
              Upload
            </PageTopBarButton>
          </>
        }
      />
      <PageDescription>
        Corrections and decklists people have proposed. Accepting one re-promotes its event, so the
        patch lands and everything else stays as the sources published it.
      </PageDescription>

      {/* Above the queue: a correction is one card to read and close, and
          below a queue of any length it is never seen. */}
      <MetaEventCorrectionsPanel />

      {data.overlays.length === 0 ? (
        <p className="text-muted-foreground">Nothing waiting.</p>
      ) : (
        <div className="space-y-3">
          {data.overlays.map((overlay) => (
            <OverlayCard key={overlay.id} overlay={overlay} />
          ))}
        </div>
      )}

      {uploadOpen && (
        <MetaOverlayUploadDialog
          onClose={() => {
            setUploadOpen(false);
          }}
        />
      )}
      {ignoredOpen && (
        <MetaIgnoredSourcesDialog
          onClose={() => {
            setIgnoredOpen(false);
          }}
        />
      )}
    </div>
  );
}
