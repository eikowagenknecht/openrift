import type { CardTradeLiveAnnotation, CopyResponse } from "@openrift/shared";
import { FileTextIcon } from "lucide-react";
import type { ReactNode } from "react";

import { CardStrip } from "@/components/cards/card-strip";
import { copyMarkers } from "@/components/collection/copy-indicators";
import { OnLoanChip } from "@/components/loans/on-loan-chip";
import { TradeStatusChip } from "@/components/trades/trade-status-chip";
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
 * copy-details editor. A copy that is out on a loan or pinned to a live trade
 * additionally leads with the static loan (ADR-039) and trade (ADR-019)
 * markers. Renders the empty row for a bare (or still loading) copy so tiles in
 * a row stay aligned.
 *
 * `tradeAnnotation` is the copy's printing's collapsed annotation. It is only
 * ever the source of the *word*, never of whether to show one: a printing's
 * annotation covers whichever copies a trade happens to have pinned, so an
 * unpinned copy of a traded printing must stay unmarked. See
 * {@link CopyMetadataPills}.
 *
 * @returns The strip row.
 */
export function CopyMetadataStrip({
  copy,
  tradeAnnotation,
}: {
  copy: CopyResponse | undefined;
  tradeAnnotation?: CardTradeLiveAnnotation | null;
}) {
  return (
    <CardStrip
      center={copy && <CopyMetadataPills copy={copy} tradeAnnotation={tradeAnnotation} />}
    />
  );
}

function CopyMetadataPills({
  copy,
  tradeAnnotation,
}: {
  copy: CopyResponse;
  tradeAnnotation?: CardTradeLiveAnnotation | null;
}) {
  const { labels } = useEnumOrders();
  return (
    <>
      {copy.onLoan && <OnLoanChip iconOnly count={1} />}
      {/* Two sources, each answering the half of this the other cannot. The
          copy's own `reserved` flag decides *whether* a marker belongs on this
          tile, because it is the only per-copy fact. A sibling copy's
          reservation, or a pending trade with nothing pinned yet, leaves this
          copy free and unmarked. The annotation decides *what it says*, because
          `reserved` stays true through the handover until the giver applies
          their sync, so it cannot tell "Reserved" from "Traded". Icon only: the
          tile is one copy, so a count would always read 1. */}
      {copy.reserved && tradeAnnotation && (
        <TradeStatusChip detail="icon" annotation={tradeAnnotation} />
      )}
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
      {copyMarkers(copy).map(({ key, icon: Icon, label, count }) => (
        <MetadataPillButton key={key} itemId={copy.id} title={label}>
          <Icon className="size-3" aria-hidden />
          {count}
        </MetadataPillButton>
      ))}
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
