import { Link, useNavigate } from "@tanstack/react-router";
import { ArchiveXIcon, ArrowLeftIcon, CheckIcon, UndoIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { MetaCandidateEventGrid } from "@/components/admin/meta-candidate-event-grid";
import { MetaCandidateLinkPanel } from "@/components/admin/meta-candidate-link-panel";
import { MetaCandidatePlayerPanel } from "@/components/admin/meta-candidate-player-panel";
import {
  CandidateDisclosure,
  CandidateStateBadge,
  ConfirmActionButton,
} from "@/components/admin/meta-candidate-shared";
import type { MetaOverwriteConfirm } from "@/components/admin/meta-overwrite-confirm-dialog";
import { MetaOverwriteConfirmDialog } from "@/components/admin/meta-overwrite-confirm-dialog";
import { MetaPlayerRoster } from "@/components/admin/meta-player-roster";
import { MetaPublicLinkButton } from "@/components/admin/meta-public-link";
import { Heading } from "@/components/heading";
import { PageTopBarButton, PageTopBarPrimaryButton } from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAdminMetaLinkedEvent } from "@/hooks/use-admin-meta";
import {
  useAcceptMetaCandidateEvent,
  useAcceptMetaCandidateEventWithPlayers,
  useAdminMetaCandidate,
  useCheckMetaCandidateEvent,
  useIgnoreMetaCandidateEvent,
  useUnlinkMetaCandidateEvent,
} from "@/hooks/use-admin-meta-candidates";
import { useDeckFormatList } from "@/hooks/use-enums";

/**
 * Summarizes what an "accept event and standings" run did, for the success toast.
 *
 * @param accepted - How many standings rows were filed.
 * @param skipped - The rows that could not be, with their reasons.
 * @returns A one-line summary.
 */
function acceptSummary(
  accepted: number,
  skipped: { playerName: string; reason: string }[],
): string {
  const head = `${accepted} ${accepted === 1 ? "player" : "players"} filed`;
  if (skipped.length === 0) {
    return `${head}.`;
  }
  const reasons = skipped.map((player) => `${player.playerName}: ${player.reason}`).join("; ");
  return `${head}. Skipped ${skipped.length}: ${reasons}`;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * One candidate event's review screen (ADR-014, amended for multi-source).
 *
 * It has two shapes, and which one shows is the link. An unlinked candidate is
 * still the one-click path a single-source event uses every week: the staged
 * values, its standings, and an accept that creates everything. A linked one
 * opens the two-tier compare screen — the event header as a field-by-field grid
 * against every source feeding the live event, then the standings roster —
 * because once two sources describe one tournament, taking everything from one
 * of them reverts what the other contributed.
 *
 * @returns The candidate detail page.
 */
export function MetaCandidateDetailPage({ candidateId }: { candidateId: string }) {
  const { data: candidate } = useAdminMetaCandidate(candidateId);
  const { data: liveEvent } = useAdminMetaLinkedEvent(candidate.metaEventId);
  const { labels: formatLabels } = useDeckFormatList();
  const navigate = useNavigate();
  const acceptEvent = useAcceptMetaCandidateEvent();
  const acceptWithPlayers = useAcceptMetaCandidateEventWithPlayers();
  const checkEvent = useCheckMetaCandidateEvent();
  const ignoreEvent = useIgnoreMetaCandidateEvent();
  const unlinkEvent = useUnlinkMetaCandidateEvent();
  const [overwrite, setOverwrite] = useState<MetaOverwriteConfirm | null>(null);

  const reviewed = candidate.checkedAt !== null;
  const linked = candidate.metaEventId !== null;
  // Once a second source feeds the event, "take everything" stops being the
  // default move — it is the one that overwrites the other source's values — so
  // the per-field grid gets the emphasis and this drops to a plain button.
  const multiSource = candidate.sources.length > 1;
  const accepting = acceptEvent.isPending || acceptWithPlayers.isPending;

  async function acceptSource(input: {
    candidateId: string;
    provider: string;
    withPlayers: boolean;
    overwriteAll: boolean;
  }) {
    if (input.withPlayers) {
      let result;
      try {
        result = await acceptWithPlayers.mutateAsync({
          id: input.candidateId,
          overwriteAll: input.overwriteAll,
        });
      } catch {
        // Reported by the global mutation error toast.
        return;
      }
      if (result.status === "needsOverwriteConfirm") {
        setOverwrite({
          candidateId: input.candidateId,
          provider: input.provider,
          message: result.message,
          withPlayers: true,
        });
        return;
      }
      setOverwrite(null);
      toast.success(`"${candidate.name}" is in the archive`, {
        description: acceptSummary(
          result.event.acceptedPlayers.length,
          result.event.skippedPlayers,
        ),
      });
      return;
    }

    let result;
    try {
      result = await acceptEvent.mutateAsync({
        id: input.candidateId,
        overwriteAll: input.overwriteAll,
      });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    if (result.status === "needsOverwriteConfirm") {
      setOverwrite({
        candidateId: input.candidateId,
        provider: input.provider,
        message: result.message,
        withPlayers: false,
      });
      return;
    }
    setOverwrite(null);
    toast.success(`Took ${input.provider}'s values`);
  }

  async function handleConfirmOverwrite() {
    if (overwrite === null) {
      return;
    }
    await acceptSource({
      candidateId: overwrite.candidateId,
      provider: overwrite.provider,
      withPlayers: overwrite.withPlayers,
      overwriteAll: true,
    });
  }

  async function handleIgnore() {
    await ignoreEvent.mutateAsync({ id: candidateId });
    await navigate({ to: "/admin/meta", search: { tab: "review" } });
  }

  const acceptAllLabel = linked
    ? `Take everything from ${candidate.provider}`
    : "Accept event + ready standings";

  return (
    <div className="space-y-6">
      <AdminPageTopBar
        title={candidate.name}
        actions={
          <>
            <ConfirmActionButton
              title={`Ignore "${candidate.name}"?`}
              description="The staged event and its standings stay, hidden from the queue, and future uploads skip this key until you unignore it."
              confirmLabel="Ignore"
              onConfirm={handleIgnore}
              trigger={<PageTopBarButton />}
            >
              <ArchiveXIcon />
              Ignore
            </ConfirmActionButton>
            <PageTopBarButton
              disabled={checkEvent.isPending}
              onClick={() => checkEvent.mutate({ id: candidateId, checked: !reviewed })}
            >
              {reviewed ? <UndoIcon /> : <CheckIcon />}
              {reviewed ? "Unmark" : "Mark reviewed"}
            </PageTopBarButton>
            {multiSource ? (
              <PageTopBarButton
                disabled={accepting}
                onClick={() =>
                  acceptSource({
                    candidateId,
                    provider: candidate.provider,
                    withPlayers: true,
                    overwriteAll: false,
                  })
                }
              >
                {acceptAllLabel}
              </PageTopBarButton>
            ) : (
              <PageTopBarPrimaryButton
                disabled={accepting}
                onClick={() =>
                  acceptSource({
                    candidateId,
                    provider: candidate.provider,
                    withPlayers: true,
                    overwriteAll: false,
                  })
                }
              >
                {acceptAllLabel}
              </PageTopBarPrimaryButton>
            )}
          </>
        }
      />

      <div>
        <Button
          variant="ghost"
          size="sm"
          render={<Link to="/admin/meta" search={{ tab: "review" }} />}
        >
          <ArrowLeftIcon />
          Review queue
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{candidate.provider}</Badge>
            <span className="text-muted-foreground font-mono text-sm">{candidate.externalId}</span>
            <CandidateStateBadge state={candidate.state} />
            {!candidate.formatKnown && (
              <Badge variant="warning">Unknown format: accepting is refused</Badge>
            )}
            {candidate.metaEventSlug && (
              <MetaPublicLinkButton
                href={`/meta/${candidate.metaEventSlug}`}
                label={candidate.metaEventSlug}
                ariaLabel={`Open ${candidate.name} on the public archive`}
                mono
              />
            )}
            {!linked && (
              <Button
                variant="outline"
                size="sm"
                className="ml-auto"
                disabled={accepting}
                onClick={() =>
                  acceptSource({
                    candidateId,
                    provider: candidate.provider,
                    withPlayers: false,
                    overwriteAll: false,
                  })
                }
              >
                Accept event only
              </Button>
            )}
          </div>

          <MetaCandidateLinkPanel
            candidateId={candidateId}
            provider={candidate.provider}
            metaEventId={candidate.metaEventId}
            metaEventName={liveEvent?.name ?? null}
          />

          {!linked && (
            <dl className="grid gap-3 sm:grid-cols-3">
              <Field label="Date">{candidate.eventDate}</Field>
              <Field label="Format">{formatLabels[candidate.format] ?? candidate.format}</Field>
              <Field label="Players">{candidate.playerCount ?? "—"}</Field>
              <Field label="Organizer">{candidate.organizer ?? "—"}</Field>
              <Field label="Source">
                {candidate.sourceUrl ? (
                  <a
                    href={candidate.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2"
                  >
                    {candidate.sourceUrl}
                  </a>
                ) : (
                  "—"
                )}
              </Field>
              <Field label="Notes">{candidate.notes ?? "—"}</Field>
            </dl>
          )}

          {candidate.extraData !== null && (
            <CandidateDisclosure title="Source fields we have no home for">
              <pre className="bg-muted overflow-x-auto rounded-md p-3 text-sm">
                <code>{candidate.extraData}</code>
              </pre>
            </CandidateDisclosure>
          )}
        </CardContent>
      </Card>

      {linked && liveEvent && (
        <section className="space-y-2">
          <Heading level={2}>Event header</Heading>
          <p className="text-muted-foreground text-sm">
            The Active column is the live event. Click a source cell to take that one value; edit
            Active directly to write something neither source got right.
          </p>
          <MetaCandidateEventGrid
            event={liveEvent}
            sources={candidate.sources}
            onAcceptSource={(sourceCandidateId, provider) =>
              acceptSource({
                candidateId: sourceCandidateId,
                provider,
                withPlayers: false,
                overwriteAll: false,
              })
            }
            // Unlinking writes no field value and takes only that provider's
            // citation with it, and relinking puts it back, so it acts straight
            // away rather than through a confirmation.
            onUnlinkSource={(sourceCandidateId, provider) => {
              unlinkEvent.mutate({ id: sourceCandidateId });
              toast.success(`Unlinked ${provider}`);
            }}
          />
        </section>
      )}

      {linked && candidate.metaEventId !== null && (
        <MetaPlayerRoster
          metaEventId={candidate.metaEventId}
          sources={candidate.sources}
          submittedPlayers={candidate.submittedPlayers}
        />
      )}

      {!linked && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Heading level={2}>Standings ({candidate.players.length})</Heading>
            {candidate.players.length > 0 && (
              <Badge variant="warning">Accept the event first to enable per-player accepts</Badge>
            )}
          </div>
          {candidate.players.length === 0 && (
            <p className="text-muted-foreground text-sm">This event carries no standings.</p>
          )}
          {candidate.players.map((player) => (
            <MetaCandidatePlayerPanel key={player.id} player={player} eventAccepted={false} />
          ))}
        </section>
      )}

      <MetaOverwriteConfirmDialog
        confirm={overwrite}
        pending={accepting}
        onCancel={() => setOverwrite(null)}
        onConfirm={handleConfirmOverwrite}
      />
    </div>
  );
}
