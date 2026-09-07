import { CategorySelectOptions } from "@/components/admin/admin-crud-shared";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * Shared by the card pipeline and meta archive resolution dialogs. Renders
 * only the reason/note inputs; each caller derives and stamps its own status.
 */
export function SubmissionMessageFields<TReason extends string>({
  idPrefix,
  reasonOrder,
  reasonLabels,
  reasonSentences,
  reason,
  onReasonChange,
  note,
  onNoteChange,
  allowNoReason = false,
  noReasonLabel = "No canned reason",
  disabled = false,
}: {
  idPrefix: string;
  reasonOrder: readonly TReason[];
  reasonLabels: Record<TReason, string>;
  reasonSentences: Record<TReason, string>;
  reason: TReason | null;
  onReasonChange: (reason: TReason | null) => void;
  note: string;
  onNoteChange: (note: string) => void;
  allowNoReason?: boolean;
  noReasonLabel?: string;
  disabled?: boolean;
}) {
  const NO_REASON = "__none__";
  const reasonItems = reasonOrder.map((option) => ({
    value: option,
    label: reasonLabels[option],
  }));
  const items = allowNoReason
    ? [{ value: NO_REASON, label: noReasonLabel }, ...reasonItems]
    : reasonItems;
  const preview = reason === null ? null : reasonSentences[reason];

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-reason`}>Reason</Label>
        <Select
          items={items}
          value={reason ?? (allowNoReason ? NO_REASON : null)}
          disabled={disabled}
          onValueChange={(next) => {
            const picked = next === null ? null : String(next);
            onReasonChange(picked === null || picked === NO_REASON ? null : (picked as TReason));
          }}
        >
          <SelectTrigger id={`${idPrefix}-reason`} aria-label="Reason">
            <SelectValue />
          </SelectTrigger>
          <CategorySelectOptions items={items} />
        </Select>
        {preview !== null && (
          <p className="text-muted-foreground text-sm">They will read: {preview}</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-note`}>Your own words (optional)</Label>
        <Textarea
          id={`${idPrefix}-note`}
          value={note}
          maxLength={2000}
          rows={3}
          disabled={disabled}
          placeholder="Replaces the sentence above when filled in."
          onChange={(event) => onNoteChange(event.target.value)}
        />
      </div>
    </>
  );
}
