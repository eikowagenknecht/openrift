import { enumLabel } from "@openrift/shared/enum-label";
import type { CardTradeLiveAnnotation } from "@openrift/shared/types/api/card-trade";
import type { CopyResponse } from "@openrift/shared/types/api/collection";
import { FileTextIcon } from "lucide-react";
import type { ReactNode } from "react";

import { CountPillButton } from "@/components/ui/count-pill";
import { CardStrip } from "@/features/cards/components/card-strip";
import { dispatchContextAction } from "@/features/cards/stores/card-row-actions-store";
import { copyMarkers } from "@/features/collections/components/copy-indicators";
import { conditionShortCode } from "@/features/collections/lib/condition-codes";
import { OnLoanChip } from "@/features/groups/components/on-loan-chip";
import { TradeStatusChip } from "@/features/groups/components/trade-status-chip";
import { useEnumOrders } from "@/hooks/use-enums";

/**
 * Stops click propagation so the tile's own click handler doesn't fire.
 * Kept out of tab order; keyboard users reach it via the context menu.
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
 * `tradeAnnotation` only supplies the label text; `copy.reserved` alone
 * decides whether a trade marker shows on this specific copy.
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
      {copy.reserved && tradeAnnotation && (
        <TradeStatusChip detail="icon" annotation={tradeAnnotation} />
      )}
      {copy.grader !== null && copy.grade !== null && (
        <MetadataPillButton
          itemId={copy.id}
          variant="primary"
          title={`Graded ${enumLabel(labels.graders, copy.grader)} ${copy.grade}`}
        >
          {enumLabel(labels.graders, copy.grader)} {copy.grade}
        </MetadataPillButton>
      )}
      {copy.condition !== null && (
        <MetadataPillButton itemId={copy.id} title={enumLabel(labels.conditions, copy.condition)}>
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

/** Count-strip extras pill shown when any of the stack's copies carries metadata; opens the Copies… picker. */
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
