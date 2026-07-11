import type { CopyResponse } from "@openrift/shared";
import { FileTextIcon, LinkIcon, PaintbrushIcon } from "lucide-react";
import type { ReactNode } from "react";

import { CardStrip } from "@/components/cards/card-strip";
import { CountPillButton } from "@/components/ui/count-pill";
import { useEnumOrders } from "@/hooks/use-enums";
import { conditionShortCode } from "@/lib/condition-codes";
import { dispatchContextAction } from "@/stores/card-row-actions-store";

/**
 * A metadata pill that opens the copy-details editor for its tile. Clicks
 * stop propagating so the tile's own click (detail pane / select toggle)
 * doesn't fire; keyboard users reach the editor via the context menu, so the
 * pill stays out of the tab order like the other strip buttons.
 *
 * @returns The clickable pill.
 */
function MetadataPillButton({
  itemId,
  title,
  variant,
  children,
}: {
  itemId: string;
  title: string;
  variant?: "muted" | "primary";
  children: ReactNode;
}) {
  return (
    <CountPillButton
      tabIndex={-1}
      variant="ghost"
      className={variant === "primary" ? "text-primary" : undefined}
      title={title}
      aria-label={`${title}. Edit copy details.`}
      onClick={(event) => {
        event.stopPropagation();
        dispatchContextAction(itemId, "copyDetails");
      }}
    >
      {children}
    </CountPillButton>
  );
}

/**
 * Per-copy metadata strip for copies-view tiles (ADR-038): a condition or
 * grade pill plus altered/notes/links markers, in the same fixed above-card
 * row the stacked views use for their count strips. Every pill opens the
 * copy-details editor. Renders the empty row for a bare (or still loading)
 * copy so tiles in a row stay aligned.
 *
 * @returns The strip row.
 */
export function CopyMetadataStrip({ copy }: { copy: CopyResponse | undefined }) {
  return <CardStrip center={copy && <CopyMetadataPills copy={copy} />} />;
}

function CopyMetadataPills({ copy }: { copy: CopyResponse }) {
  const { labels } = useEnumOrders();
  const hasNotes = copy.notesPublic !== null || copy.notesPrivate !== null;
  return (
    <>
      {copy.grader !== null && copy.grade !== null && (
        <MetadataPillButton
          itemId={copy.id}
          variant="primary"
          title={`Graded ${labels.graders[copy.grader]} ${copy.grade}`}
        >
          {labels.graders[copy.grader]} {copy.grade}
        </MetadataPillButton>
      )}
      {copy.condition !== null && (
        <MetadataPillButton itemId={copy.id} title={labels.conditions[copy.condition]}>
          {conditionShortCode(copy.condition)}
        </MetadataPillButton>
      )}
      {copy.isAltered && (
        <MetadataPillButton itemId={copy.id} title="Altered">
          <PaintbrushIcon className="size-3" aria-hidden />
        </MetadataPillButton>
      )}
      {hasNotes && (
        <MetadataPillButton itemId={copy.id} title="Has notes">
          <FileTextIcon className="size-3" aria-hidden />
        </MetadataPillButton>
      )}
      {copy.links.length > 0 && (
        <MetadataPillButton
          itemId={copy.id}
          title={
            copy.links.length === 1
              ? "1 photo/video link"
              : `${copy.links.length} photo/video links`
          }
        >
          <LinkIcon className="size-3" aria-hidden />
          {copy.links.length}
        </MetadataPillButton>
      )}
    </>
  );
}

/**
 * Stacked-tile indicator (ADR-038) for the count strip's extras slot: one
 * compact pill when any of the stack's copies carries metadata. Clicking it
 * opens the Copies… picker, so annotations stay one click away without
 * expanding to copies view.
 *
 * @returns The indicator pill.
 */
export function StackMetadataChip({
  itemId,
  annotatedCount,
}: {
  itemId: string;
  annotatedCount: number;
}) {
  return (
    <MetadataPillButton
      itemId={itemId}
      title={annotatedCount === 1 ? "1 copy with details" : `${annotatedCount} copies with details`}
    >
      <FileTextIcon className="size-3" aria-hidden />
      {annotatedCount}
    </MetadataPillButton>
  );
}
