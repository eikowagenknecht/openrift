import type { AdminPrintingResponse, ProviderSettingResponse } from "@openrift/shared";
import { formatPrintingLabel } from "@openrift/shared";
import {
  ArrowRightIcon,
  CheckCheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
} from "lucide-react";
import { useState } from "react";

import type { FieldDef, PrintingGroup } from "@/components/admin/candidate-spreadsheet";
import { CandidateSpreadsheet } from "@/components/admin/candidate-spreadsheet";
import { useCardDetailData } from "@/components/admin/card-detail-shared";
import { GroupImagePreview } from "@/components/admin/image-preview";
import { PrintingSourceActions } from "@/components/admin/printing-source-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const REQUIRED_PRINTING_KEYS = [
  "shortCode",
  "setId",
  "collectorNumber",
  "rarity",
  "artVariant",
  "isSigned",
  "finish",
  "artist",
  "publicCode",
];

export function NewPrintingGroupCard({
  group,
  existingPrintings,
  promoTypes,
  providerLabels,
  providerNames,
  providerSettings,
  setTotals,
  isExpanded,
  onToggle,
  onAccept,
  onLink,
  onCopy,
  onDelete,
  onIgnore,
  isAccepting,
  isLinking,
  printingFields,
}: {
  group: PrintingGroup & { groupKey: string };
  existingPrintings: AdminPrintingResponse[];
  promoTypes: { id: string; slug: string }[];
  providerLabels: Record<string, string>;
  providerNames: Record<string, string>;
  providerSettings: ProviderSettingResponse[];
  setTotals: Record<string, number>;
  isExpanded: boolean;
  onToggle: () => void;
  onAccept: (printingFields: Record<string, unknown>, candidatePrintingIds: string[]) => void;
  onLink: (printingId: string, candidatePrintingIds: string[]) => void;
  onCopy: (id: string, printingId: string) => void;
  onDelete: (id: string) => void;
  onIgnore: (externalId: string, finish: string) => void;
  isAccepting: boolean;
  isLinking?: boolean;
  printingFields: FieldDef[];
}) {
  const { checkPrintingSource, uncheckPrintingSource, checkAllCandidatePrintings } =
    useCardDetailData();
  const [activePrinting, setActivePrinting] = useState<Record<string, unknown>>({});

  /**
   * Append `/{printedTotal}` to a public code if the set total is known and not already present.
   *
   * @returns The record with publicCode updated, or unchanged if not applicable.
   */
  function withSetTotal(record: Record<string, unknown>): Record<string, unknown> {
    const code = record.publicCode;
    const setSlug = record.setId;
    if (typeof code !== "string" || typeof setSlug !== "string") {
      return record;
    }
    const total = setTotals[setSlug];
    if (!total || code.includes("/")) {
      return record;
    }
    return { ...record, publicCode: `${code}/${total}` };
  }

  const hasRequired = REQUIRED_PRINTING_KEYS.every((k) => {
    const v = activePrinting[k];
    return v !== undefined && v !== null && v !== "";
  });

  const promoSlug = activePrinting.promoTypeId
    ? (promoTypes.find((pt) => pt.id === activePrinting.promoTypeId)?.slug ?? null)
    : null;
  const printingLabel = hasRequired
    ? formatPrintingLabel(
        activePrinting.shortCode as string,
        promoSlug,
        activePrinting.finish as string,
        (activePrinting.language as string | undefined) ?? null,
      )
    : "";

  const guessedId = group.expectedPrintingId;

  // custom: find existing printing whose expectedPrintingId matches the guessed ID so we can offer a quick "assign all" action
  const matchingExisting = existingPrintings.find((p) => p.expectedPrintingId === guessedId);

  return (
    <div
      className={cn(
        "rounded-md border border-dashed",
        group.candidates.every((s) => s.checkedAt) ? "border-green-600/40" : "border-yellow-500/60",
      )}
    >
      {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- contains nested buttons, can't use <button> */}
      <div
        className="flex cursor-pointer flex-wrap items-center gap-3 px-3 py-2 hover:opacity-70"
        onClick={onToggle}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          {isExpanded ? (
            <ChevronDownIcon className="size-4" />
          ) : (
            <ChevronRightIcon className="size-4" />
          )}
          <span>
            New: <span className="text-muted-foreground">{printingLabel || guessedId}</span> (
            {group.candidates.length} source
            {group.candidates.length === 1 ? "" : "s"})
          </span>
        </span>
        {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- stopPropagation wrapper, not interactive */}
        <div className="flex flex-wrap items-end gap-2" onClick={(e) => e.stopPropagation()}>
          {group.candidates.some((s) => !s.checkedAt) && (
            <Button
              variant="outline"
              disabled={checkAllCandidatePrintings.isPending}
              onClick={(e) => {
                e.stopPropagation();
                checkAllCandidatePrintings.mutate({
                  extraIds: group.candidates.filter((s) => !s.checkedAt).map((s) => s.id),
                });
              }}
            >
              <CheckCheckIcon className="mr-1 size-3" />
              Check {group.candidates.filter((s) => !s.checkedAt).length} unchecked
            </Button>
          )}
          {/* custom: quick-assign all candidates to matching existing printing */}
          {matchingExisting && (
            <Button
              variant="default"
              disabled={isLinking}
              onClick={() =>
                onLink(
                  matchingExisting.id,
                  group.candidates.map((s) => s.id),
                )
              }
            >
              <ArrowRightIcon className="mr-1 size-3.5" />
              Assign all to existing
            </Button>
          )}
          <Button
            variant="outline"
            disabled={!hasRequired || isAccepting}
            onClick={() =>
              onAccept(
                activePrinting,
                group.candidates.map((s) => s.id),
              )
            }
          >
            <PlusIcon className="mr-1 size-3.5" />
            Accept as new printing
          </Button>
        </div>
      </div>
      {isExpanded && (
        <>
          {!hasRequired && (
            <p className="text-muted-foreground px-3 pb-2">
              Click cells to fill all required fields (marked with *).
            </p>
          )}
          <div className="flex gap-3 border-t p-3">
            <GroupImagePreview
              sources={group.candidates}
              providerLabels={providerLabels}
              providerSettings={providerSettings}
            />
            <div className="min-w-0 flex-1">
              <CandidateSpreadsheet
                key={group.candidates.map((s) => s.id).join(",")}
                fields={printingFields}
                requiredKeys={REQUIRED_PRINTING_KEYS}
                activeRow={Object.keys(activePrinting).length > 0 ? activePrinting : null}
                candidateRows={group.candidates}
                providerLabels={providerLabels}
                providerNames={providerNames}
                providerSettings={providerSettings}
                onCellClick={(field, value) => {
                  setActivePrinting((prev) => withSetTotal({ ...prev, [field]: value }));
                }}
                onActiveChange={(field, value) => {
                  setActivePrinting((prev) =>
                    value === null || value === undefined
                      ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== field))
                      : withSetTotal({ ...prev, [field]: value }),
                  );
                }}
                onCheck={(id) => checkPrintingSource.mutate(id)}
                onUncheck={(id) => uncheckPrintingSource.mutate(id)}
                columnActions={(row) => (
                  <PrintingSourceActions
                    targets={existingPrintings.map((p) => ({
                      id: p.id,
                      label: p.expectedPrintingId,
                    }))}
                    onAssign={(pid) => onLink(pid, [row.id])}
                    onCopy={(pid) => onCopy(row.id, pid)}
                    onAcceptAll={() => {
                      const record = row as unknown as Record<string, unknown>;
                      const values: Record<string, unknown> = {};
                      for (const field of printingFields) {
                        if (field.readOnly) {
                          continue;
                        }
                        const val = record[field.key];
                        if (val === null || val === undefined || val === "") {
                          continue;
                        }
                        if (field.options && !field.options.includes(String(val))) {
                          continue;
                        }
                        values[field.key] = val;
                      }
                      setActivePrinting((prev) => withSetTotal({ ...prev, ...values }));
                    }}
                    onIgnore={() =>
                      onIgnore(row.externalId, (row as unknown as Record<string, string>).finish)
                    }
                    onDelete={() => onDelete(row.id)}
                  />
                )}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
