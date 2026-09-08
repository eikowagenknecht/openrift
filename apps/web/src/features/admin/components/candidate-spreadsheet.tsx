import type { ProviderSettingResponse } from "@openrift/shared/types/api/admin";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { Fragment, useState } from "react";

import { CandidateActiveCell } from "@/features/admin/components/candidate-active-cell";
import type { FieldDef } from "@/features/admin/components/candidate-field-defs";
import { CandidateSpreadsheetHeader } from "@/features/admin/components/candidate-spreadsheet-header";
import { CandidateValueCell } from "@/features/admin/components/candidate-value-cell";
import type { CandidateSpreadsheetRow } from "@/features/admin/lib/candidate-rows";
import { favoriteProviderSet, sortCandidateRows } from "@/features/admin/lib/candidate-rows";
import type { SourceSubmitter } from "@/features/admin/lib/candidate-submitter";

interface CandidateSpreadsheetProps<
  TKey extends string = string,
  TRow extends CandidateSpreadsheetRow = CandidateSpreadsheetRow,
> {
  fields: FieldDef<TKey>[];
  activeRow: Record<string, unknown> | null;
  candidateRows: TRow[];
  providerLabels?: Record<string, string>;
  providerNames?: Record<string, string>;
  submitters?: Record<string, SourceSubmitter>;
  providerSettings?: ProviderSettingResponse[];
  requiredKeys?: string[];
  onCellClick?: (field: TKey, value: unknown, candidateId: string) => void;
  onActiveChange?: (field: TKey, value: unknown | null) => void;
  onCheck?: (candidateId: string) => void;
  onUncheck?: (candidateId: string) => void;
  columnActions?: React.ReactElement<{ row?: NoInfer<TRow> }>;
  columnClassName?: (row: NoInfer<TRow>) => string | undefined;
  cellWarning?: (fieldKey: string, candidateValue: unknown) => string | null;
  normalizeCandidate?: (fieldKey: string, value: unknown) => unknown;
  activeImageUrl?: string | null;
  costKeywords?: readonly string[];
  activeColumnBadge?: React.ReactNode;
}

export function CandidateSpreadsheet<
  TKey extends string = string,
  TRow extends CandidateSpreadsheetRow = CandidateSpreadsheetRow,
>({
  fields,
  activeRow,
  candidateRows,
  providerLabels,
  providerNames,
  submitters,
  providerSettings,
  requiredKeys,
  onCellClick,
  onActiveChange,
  onCheck,
  onUncheck,
  columnActions,
  columnClassName,
  cellWarning,
  normalizeCandidate,
  activeImageUrl,
  costKeywords = [],
  activeColumnBadge,
}: CandidateSpreadsheetProps<TKey, TRow>) {
  const favoriteProviders = favoriteProviderSet(providerSettings);
  const sortedRows = sortCandidateRows(candidateRows, providerLabels, providerSettings);

  const [editingField, setEditingField] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);

  const hasCollapsible = fields.some((f) => f.collapsible);

  return (
    <div className="w-fit max-w-full overflow-x-auto rounded-md border">
      <table className="table-fixed text-sm" style={{ width: 150 + 300 * (1 + sortedRows.length) }}>
        <CandidateSpreadsheetHeader
          sortedRows={sortedRows}
          providerLabels={providerLabels}
          providerNames={providerNames}
          submitters={submitters}
          favoriteProviders={favoriteProviders}
          onCheck={onCheck}
          onUncheck={onUncheck}
          columnActions={columnActions}
          columnClassName={columnClassName}
          activeColumnBadge={activeColumnBadge}
        />
        <tbody>
          {fields.map((field, fieldIndex) => {
            if (field.collapsible && collapsed) {
              return null;
            }

            const activeValue = activeRow ? (activeRow[field.key] as unknown) : null;
            const isRequired = requiredKeys?.includes(field.key) ?? false;

            const isFirstCollapsible =
              hasCollapsible && !field.collapsible && fields[fieldIndex + 1]?.collapsible;

            const fieldRow = (
              <tr key={field.key} className="border-b last:border-b-0">
                <td className="bg-background sticky left-0 z-10 px-3 py-1.5 font-medium">
                  {field.label}
                  {isRequired && <span className="text-destructive ml-0.5">*</span>}
                </td>
                <CandidateActiveCell
                  field={field}
                  activeRow={activeRow}
                  activeValue={activeValue}
                  isRequired={isRequired}
                  editingField={editingField}
                  setEditingField={setEditingField}
                  onActiveChange={onActiveChange}
                  activeImageUrl={activeImageUrl}
                  costKeywords={costKeywords}
                />
                {sortedRows.map((row) => (
                  <CandidateValueCell
                    key={row.id}
                    field={field}
                    row={row}
                    activeRow={activeRow}
                    activeValue={activeValue}
                    providerLabels={providerLabels}
                    favoriteProviders={favoriteProviders}
                    normalizeCandidate={normalizeCandidate}
                    cellWarning={cellWarning}
                    onCellClick={onCellClick}
                  />
                ))}
              </tr>
            );

            if (!isFirstCollapsible) {
              return fieldRow;
            }

            const collapsibleCount = fields.filter((f) => f.collapsible).length;
            return (
              <Fragment key={`${field.key}+toggle`}>
                {fieldRow}
                {/* oxlint-disable-next-line jsx-a11y/control-has-associated-label -- label lives in the <td> inside; rule doesn't see across children */}
                <tr
                  className="bg-muted/30 hover:bg-muted/50 cursor-pointer border-b"
                  onClick={() => setCollapsed((c) => !c)}
                >
                  <td
                    className="bg-muted/30 text-muted-foreground sticky left-0 z-10 px-3 py-1 font-medium"
                    colSpan={2 + sortedRows.length}
                  >
                    <span className="inline-flex items-center gap-1">
                      {collapsed ? (
                        <ChevronRightIcon className="size-3" />
                      ) : (
                        <ChevronDownIcon className="size-3" />
                      )}
                      {collapsed
                        ? `${collapsibleCount} more field${collapsibleCount > 1 ? "s" : ""}`
                        : "Hide"}
                    </span>
                  </td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
