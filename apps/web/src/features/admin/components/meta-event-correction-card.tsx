import type { AdminMetaEventCorrection } from "@openrift/shared/contracts/admin/meta-submissions";
import { formatDayTime } from "@openrift/shared/format-date";
import { Link } from "@tanstack/react-router";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetaSubmissionResolve } from "@/features/admin/components/meta-submission-resolve";
import { metaEventCorrectionRows } from "@/features/meta/lib/meta-event-correction-review";

export function MetaEventCorrectionCard({ correction }: { correction: AdminMetaEventCorrection }) {
  const rows = metaEventCorrectionRows(correction.fieldEdits, correction.event);
  const { submission, event } = correction;

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">correction</Badge>
        <span className="text-muted-foreground text-sm tabular-nums">
          {formatDayTime(submission.createdAt)}
        </span>
        {submission.note !== null && (
          <span className="text-muted-foreground text-sm">&ldquo;{submission.note}&rdquo;</span>
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

      {event === null && (
        <p className="text-muted-foreground text-sm">
          The event this was about is gone, so there is nothing to apply. Close it out.
        </p>
      )}

      {rows.length > 0 && (
        <ul className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          {rows.map((row) => (
            <li key={row.field} className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">{row.label}</span>
              <span className="tabular-nums">{row.current}</span>
              <span className="text-muted-foreground">→</span>
              <span className="font-medium tabular-nums">{row.proposed}</span>
            </li>
          ))}
        </ul>
      )}

      {rows.length === 0 && event !== null && (
        <p className="text-muted-foreground text-sm">
          No field values were proposed, so the note is the whole of it.
        </p>
      )}

      <div className="border-t pt-2">
        <MetaSubmissionResolve submission={submission} playerOverlayId={null} />
      </div>
    </div>
  );
}
