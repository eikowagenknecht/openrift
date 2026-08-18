import { CategorySelectOptions } from "@/components/admin/admin-crud-shared";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * The message a contributor gets back about something they submitted: a canned
 * reason and, optionally, the reviewer's own words.
 *
 * Shared by the card pipeline's resolution dialog (ADR-036) and the meta
 * archive's (ADR-014) because this is the one surface where drift actually
 * hurts. What a reason is called, what the note's placeholder promises, and how
 * the canned sentence is previewed are the words behind the only message a
 * contributor ever receives, and two copies of them would drift in tone long
 * before they drifted in code.
 *
 * What is deliberately NOT here: the outcome. The card pipeline derives a
 * submission's status from its check and ignore verbs and this form only
 * describes it; the meta archive has no ignore path to derive from, so its
 * shell stamps the status explicitly. That difference is why the two keep
 * separate shells instead of becoming one dialog with a mode flag.
 *
 * @returns The reason picker, its preview line, and the note field.
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
  /** Namespaces the field ids, so two of these can coexist on one page. */
  idPrefix: string;
  /** The reasons to offer, in the order the reviewer is most likely to want them. */
  reasonOrder: readonly TReason[];
  /** Short labels for the picker. */
  reasonLabels: Record<TReason, string>;
  /** The sentence each reason puts in front of the contributor. */
  reasonSentences: Record<TReason, string>;
  reason: TReason | null;
  onReasonChange: (reason: TReason | null) => void;
  note: string;
  onNoteChange: (note: string) => void;
  /**
   * Offers an explicit "say nothing canned" option. Off by default: a surface
   * that requires a reason should not show a way to clear it.
   */
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
