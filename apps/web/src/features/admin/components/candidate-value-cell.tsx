import { TriangleAlertIcon } from "lucide-react";

import {
  DIFF_FIELDS,
  DiffText,
  ImageUrlCell,
  renderLabeledValue,
} from "@/features/admin/components/candidate-cell-display";
import type { FieldDef } from "@/features/admin/components/candidate-field-defs";
import { hasDropdown, isValidOption } from "@/features/admin/components/candidate-field-defs";
import { formatValue, hasValue } from "@/features/admin/lib/candidate-cell-values";
import type { CandidateSpreadsheetRow } from "@/features/admin/lib/candidate-rows";
import { isChecked, isFavoriteProvider } from "@/features/admin/lib/candidate-rows";
import { textDiff } from "@/lib/text-diff";
import { cn } from "@/lib/utils";

export function CandidateValueCell<TKey extends string>({
  field,
  row,
  activeRow,
  activeValue,
  providerLabels,
  favoriteProviders,
  normalizeCandidate,
  cellWarning,
  onCellClick,
}: {
  field: FieldDef<TKey>;
  row: CandidateSpreadsheetRow;
  activeRow: Record<string, unknown> | null;
  activeValue: unknown;
  providerLabels?: Record<string, string>;
  favoriteProviders: Set<string>;
  normalizeCandidate?: (fieldKey: string, value: unknown) => unknown;
  cellWarning?: (fieldKey: string, candidateValue: unknown) => string | null;
  onCellClick?: (field: TKey, value: unknown, candidateId: string) => void;
}) {
  const record = row as unknown as Record<string, unknown>;
  const candidateValue = record[field.key];
  const normalizedCandidate = normalizeCandidate
    ? normalizeCandidate(field.key, candidateValue)
    : candidateValue;
  const invalidOption =
    hasDropdown(field) && hasValue(candidateValue) && !isValidOption(field, candidateValue);
  const isClickable =
    !field.readOnly &&
    !invalidOption &&
    hasValue(candidateValue) &&
    (activeRow === null || JSON.stringify(normalizedCandidate) !== JSON.stringify(activeValue));
  const isDifferent = isClickable && activeRow !== null;
  const warningText =
    cellWarning && hasValue(candidateValue) ? cellWarning(field.key, candidateValue) : null;

  return (
    <td
      title={
        invalidOption
          ? `"${String(candidateValue)}" is not a valid ${field.label.toLowerCase()}`
          : undefined
      }
      className={cn(
        "border-l px-3 py-1.5 break-words",
        field.multiline && "whitespace-pre-wrap",
        isFavoriteProvider(row, providerLabels, favoriteProviders) && "bg-info-soft",
        isChecked(row) && "opacity-50",
        invalidOption && "bg-destructive-soft line-through",
        isDifferent && "bg-warning-soft",
        isClickable && onCellClick && "hover:bg-warning/20 cursor-pointer",
      )}
      onClick={
        isClickable && onCellClick
          ? () => onCellClick(field.key, normalizedCandidate, row.id)
          : undefined
      }
    >
      {warningText && (
        <span title={warningText} className="text-warning mr-1 inline-flex align-middle">
          <TriangleAlertIcon className="size-3.5" />
        </span>
      )}
      {field.key === "imageUrl" && typeof candidateValue === "string" ? (
        <ImageUrlCell url={candidateValue} alt="Candidate" />
      ) : isDifferent &&
        DIFF_FIELDS.has(field.key) &&
        typeof normalizedCandidate === "string" &&
        typeof activeValue === "string" ? (
        <DiffText segments={textDiff(activeValue, normalizedCandidate)} />
      ) : field.labeledOptions ? (
        renderLabeledValue(field, candidateValue)
      ) : (
        formatValue(candidateValue, field.suffixKey ? record[field.suffixKey] : undefined)
      )}
    </td>
  );
}
