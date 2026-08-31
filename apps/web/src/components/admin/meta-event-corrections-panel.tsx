import { formatDayTime } from "@openrift/shared";
import type { AdminMetaEventCorrection } from "@openrift/shared/contracts/admin/meta-submissions";
import { Link } from "@tanstack/react-router";

import { MetaPublicLinkButton } from "@/components/admin/meta-public-link";
import { MetaSubmissionResolve } from "@/components/admin/meta-submission-resolve";
import { Heading } from "@/components/heading";
import { Button } from "@/components/ui/button";
import { useMetaEventCorrections } from "@/hooks/use-admin-meta-submissions";
import { metaEventCorrectionRows } from "@/lib/meta-event-correction-review";

/**
 * One correction: what the sender wrote, and each proposed value beside the one
 * it would replace.
 *
 * @returns The correction's card.
 */
function CorrectionCard({ correction }: { correction: AdminMetaEventCorrection }) {
  const rows = metaEventCorrectionRows(correction.fieldEdits, correction.event);
  const { submission, event } = correction;

  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{submission.eventName}</span>
        <span className="text-muted-foreground text-sm tabular-nums">
          {formatDayTime(submission.createdAt)}
        </span>
        {event !== null && (
          <MetaPublicLinkButton
            href={`/meta/${event.slug}`}
            label={event.slug}
            ariaLabel={`Open ${event.name} on the public archive`}
            mono
          />
        )}
        {event !== null && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            render={<Link to="/admin/meta/$eventId" params={{ eventId: event.id }} />}
          >
            Edit the event
          </Button>
        )}
      </div>

      {submission.note !== null && (
        <p className="text-muted-foreground mt-2 text-sm">&ldquo;{submission.note}&rdquo;</p>
      )}

      {event === null && (
        <p className="text-muted-foreground mt-2 text-sm">
          The event this was about is gone, so there is nothing to apply. Close it out.
        </p>
      )}

      {rows.length > 0 && (
        <ul className="mt-2 space-y-1">
          {rows.map((row) => (
            <li key={row.field} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground w-24 shrink-0">{row.label}</span>
              <span className="tabular-nums">{row.current}</span>
              <span className="text-muted-foreground">→</span>
              <span className="font-medium tabular-nums">{row.proposed}</span>
            </li>
          ))}
        </ul>
      )}

      {rows.length === 0 && event !== null && (
        <p className="text-muted-foreground mt-2 text-sm">
          No field values were proposed, so the note is the whole of it.
        </p>
      )}

      <div className="mt-2 border-t pt-2">
        <MetaSubmissionResolve submission={submission} playerOverlayId={null} />
      </div>
    </div>
  );
}

/**
 * Corrections to an event's own facts, waiting in the review queue.
 *
 * Unlike a decklist there is no accept that applies one: the values are a
 * proposal, and the admin edits the event themselves before stamping the
 * outcome the contributor reads. The section disappears when the queue is
 * empty, so it never adds a heading to a page with nothing under it.
 *
 * @returns The section, or null when nothing is waiting.
 */
export function MetaEventCorrectionsPanel() {
  const { data } = useMetaEventCorrections();
  const items = data?.items ?? [];
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Heading level={2}>Suggested corrections</Heading>
        <span className="text-muted-foreground text-sm">
          {items.length} {items.length === 1 ? "event" : "events"}
          {data?.hasMore === true && " (more waiting)"}
        </span>
      </div>
      <div className="space-y-2">
        {items.map((correction) => (
          <CorrectionCard key={correction.submission.id} correction={correction} />
        ))}
      </div>
      {data?.hasMore === true && (
        <p className="text-muted-foreground text-sm">
          Only the {items.length} oldest are shown. Close some out and the rest appear.
        </p>
      )}
    </section>
  );
}
