import { Link, useNavigate } from "@tanstack/react-router";
import { ArchiveXIcon, ArrowLeftIcon, CheckIcon, UndoIcon } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { MetaCandidateDeckPanel } from "@/components/admin/meta-candidate-deck-panel";
import {
  CandidateDisclosure,
  CandidateStateBadge,
  ConfirmActionButton,
} from "@/components/admin/meta-candidate-shared";
import { MetaPublicLinkButton } from "@/components/admin/meta-public-link";
import { Heading } from "@/components/heading";
import { PageTopBarButton, PageTopBarPrimaryButton } from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useAcceptMetaCandidateEvent,
  useAcceptMetaCandidateEventWithDecks,
  useAdminMetaCandidate,
  useCheckMetaCandidateEvent,
  useIgnoreMetaCandidateEvent,
} from "@/hooks/use-admin-meta-candidates";
import { useDeckFormatList } from "@/hooks/use-enums";
import { formatDiffValue } from "@/lib/meta-candidate-review";

/**
 * Summarizes what an "accept event and decks" run did, for the success toast.
 *
 * @param accepted - How many decks were archived.
 * @param skipped - The decks that could not be, with their reasons.
 * @returns A one-line summary.
 */
function acceptSummary(
  accepted: number,
  skipped: { playerName: string; reason: string }[],
): string {
  const head = `${accepted} deck${accepted === 1 ? "" : "s"} archived`;
  if (skipped.length === 0) {
    return `${head}.`;
  }
  const reasons = skipped.map((deck) => `${deck.playerName}: ${deck.reason}`).join("; ");
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
 * One candidate event's review page (ADR-014): the staged event, its diff
 * against the live row once linked, and every deck under it. Accepting is split
 * on purpose — the event alone, or the event plus every deck that is ready —
 * because an unmatched card name blocks its deck without blocking the event.
 *
 * @returns The candidate detail page.
 */
export function MetaCandidateDetailPage({ candidateId }: { candidateId: string }) {
  const { data: candidate } = useAdminMetaCandidate(candidateId);
  const { labels: formatLabels } = useDeckFormatList();
  const navigate = useNavigate();
  const acceptEvent = useAcceptMetaCandidateEvent();
  const acceptWithDecks = useAcceptMetaCandidateEventWithDecks();
  const checkEvent = useCheckMetaCandidateEvent();
  const ignoreEvent = useIgnoreMetaCandidateEvent();

  const reviewed = candidate.checkedAt !== null;
  const eventAccepted = candidate.metaEventId !== null;
  const diffRows = candidate.diff ?? [];

  async function handleAcceptEvent() {
    try {
      await acceptEvent.mutateAsync({ id: candidateId });
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    toast.success(`"${candidate.name}" is in the archive`);
  }

  async function handleAcceptAll() {
    let accepted = 0;
    let skipped: { playerName: string; reason: string }[] = [];
    try {
      const result = await acceptWithDecks.mutateAsync({ id: candidateId });
      accepted = result.acceptedDecks.length;
      skipped = result.skippedDecks;
    } catch {
      // Reported by the global mutation error toast.
      return;
    }
    toast.success(`"${candidate.name}" is in the archive`, {
      description: acceptSummary(accepted, skipped),
    });
  }

  async function handleIgnore() {
    await ignoreEvent.mutateAsync({ id: candidateId });
    await navigate({ to: "/admin/meta", search: { tab: "candidates" } });
  }

  return (
    <div className="space-y-6">
      <AdminPageTopBar
        title={candidate.name}
        actions={
          <>
            <ConfirmActionButton
              title={`Ignore "${candidate.name}"?`}
              description="The staged event and its decks are deleted, and future uploads skip this key until you unignore it."
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
            <PageTopBarPrimaryButton onClick={handleAcceptAll} disabled={acceptWithDecks.isPending}>
              Accept event + ready decks
            </PageTopBarPrimaryButton>
          </>
        }
      />

      <div>
        <Button
          variant="ghost"
          size="sm"
          render={<Link to="/admin/meta" search={{ tab: "candidates" }} />}
        >
          <ArrowLeftIcon />
          All candidates
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
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={handleAcceptEvent}
              disabled={acceptEvent.isPending}
            >
              Accept event only
            </Button>
          </div>

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

          {candidate.extraData !== null && (
            <CandidateDisclosure title="Source fields we have no home for">
              <pre className="bg-muted overflow-x-auto rounded-md p-3 text-sm">
                <code>{candidate.extraData}</code>
              </pre>
            </CandidateDisclosure>
          )}

          {candidate.diff !== null && (
            <div className="space-y-2">
              <Heading level={3}>Changes against the live event</Heading>
              {diffRows.length === 0 && (
                <p className="text-muted-foreground text-sm">No changes.</p>
              )}
              {diffRows.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Field</TableHead>
                      <TableHead>Live</TableHead>
                      <TableHead>Candidate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {diffRows.map((row) => (
                      <TableRow key={row.field}>
                        <TableCell>{row.field}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDiffValue(row.from)}
                        </TableCell>
                        <TableCell>{formatDiffValue(row.to)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Heading level={2}>Decks ({candidate.decks.length})</Heading>
          {!eventAccepted && candidate.decks.length > 0 && (
            <Badge variant="warning">Accept the event first to enable deck accepts</Badge>
          )}
        </div>
        {candidate.decks.length === 0 && (
          <p className="text-muted-foreground text-sm">This event carries no decks.</p>
        )}
        {candidate.decks.map((deck) => (
          <MetaCandidateDeckPanel key={deck.id} deck={deck} eventAccepted={eventAccepted} />
        ))}
      </section>
    </div>
  );
}
