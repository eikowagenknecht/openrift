import type {
  AdminPrintingResponse,
  CandidateCardResponse,
  CandidatePrintingResponse,
  ProviderSettingResponse,
} from "@openrift/shared";
import { appendSetTotal, formatPrintingLabel } from "@openrift/shared";
import {
  ArrowRightIcon,
  CheckCheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PlusIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import type { FieldDef, PrintingGroup } from "@/components/admin/candidate-spreadsheet";
import { CandidateSpreadsheet } from "@/components/admin/candidate-spreadsheet";
import {
  buildPreseededActivePrinting,
  buildPrintingNormalizer,
  deduplicateSourceImages,
  sortByProviderOrder,
  useCardDetailData,
} from "@/components/admin/card-detail-shared";
import { GroupImagePreview } from "@/components/admin/image-preview";
import { PrintingSourceActions } from "@/components/admin/printing-source-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const REQUIRED_PRINTING_KEYS = [
  "shortCode",
  "setId",
  "rarity",
  "artVariant",
  "isSigned",
  "finish",
  "artist",
  "publicCode",
];

interface NewPrintingColumnActionsProps {
  row?: CandidateCardResponse | CandidatePrintingResponse;
  existingPrintings: AdminPrintingResponse[];
  printingFields: FieldDef[];
  onLink: (printingId: string, candidatePrintingIds: string[]) => void;
  onCopy: (id: string, printingId: string) => void;
  onAcceptAllForRow: (rowId: string, values: Record<string, unknown>) => void;
  onIgnore: (externalId: string, finish: string) => void;
  onDelete: (id: string) => void;
  /** Card-review grant holders keep only the client-side "Accept all fields". */
  isAdmin: boolean;
}

function NewPrintingColumnActions({
  row,
  existingPrintings,
  printingFields,
  onLink,
  onCopy,
  onAcceptAllForRow,
  onIgnore,
  onDelete,
  isAdmin,
}: NewPrintingColumnActionsProps) {
  if (!row) {
    return null;
  }
  return (
    <PrintingSourceActions
      targets={existingPrintings.map((p) => ({
        id: p.id,
        label: p.expectedPrintingId,
      }))}
      onAssign={isAdmin ? (pid) => onLink(pid, [row.id]) : undefined}
      onCopy={isAdmin ? (pid) => onCopy(row.id, pid) : undefined}
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
        onAcceptAllForRow(row.id, values);
      }}
      onIgnore={
        isAdmin
          ? () => onIgnore(row.externalId, (row as unknown as Record<string, string>).finish)
          : undefined
      }
      onDelete={isAdmin ? () => onDelete(row.id) : undefined}
    />
  );
}

export function NewPrintingGroupCard({
  group,
  existingPrintings,
  providerLabels,
  providerNames,
  providerSettings,
  setTotals,
  setReleaseYears,
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
  costKeywords = [],
  invalidates,
  isAdmin,
}: {
  group: PrintingGroup & { groupKey: string };
  existingPrintings: AdminPrintingResponse[];
  providerLabels: Record<string, string>;
  providerNames: Record<string, string>;
  providerSettings: ProviderSettingResponse[];
  setTotals: Record<string, number>;
  /** Map from set slug to the year of its release date, for pre-filling Printed Year. */
  setReleaseYears: Record<string, number>;
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
  costKeywords?: readonly string[];
  invalidates: readonly (readonly unknown[])[];
  /** Card-review grant holders keep the accept flow; check/assign/ignore/delete stay full-admin. */
  isAdmin: boolean;
}) {
  const { checkPrintingSource, uncheckPrintingSource, checkAllCandidatePrintings } =
    useCardDetailData(invalidates);
  const [activePrinting, setActivePrinting] = useState<Record<string, unknown>>({});
  // Once the admin edits the Active column the pre-seed stops re-applying and the
  // "Pre-filled" marker clears. From then on the selection is their explicit choice.
  const [touched, setTouched] = useState(false);

  /**
   * Append `/{printedTotal}` to a public code via the shared `appendSetTotal`,
   * which skips runes/tokens and codes that already carry a slash — so a full
   * code like `VEN-R02-EN` is left untouched.
   *
   * @returns The record with publicCode updated, or unchanged if not applicable.
   */
  function withSetTotal(record: Record<string, unknown>): Record<string, unknown> {
    const code = record.publicCode;
    const setSlug = record.setId;
    if (typeof code !== "string" || typeof setSlug !== "string") {
      return record;
    }
    const withTotal = appendSetTotal(code, setTotals[setSlug]);
    return withTotal === code ? record : { ...record, publicCode: withTotal };
  }

  // Mirrors the transforms the accept endpoint applies (typography fixes on
  // rules/effect/flavor, set-total on publicCode), so values copied from a
  // provider land in their final saved form instead of needing a manual "Fix".
  const normalizePrinting = buildPrintingNormalizer(
    setTotals,
    group.candidates[0]?.setId,
    costKeywords,
  );
  function normalizeRecord(record: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(record).map(([key, value]) => [key, normalizePrinting(key, value)]),
    );
  }

  // Pre-seed the Active column from the highest-priority source so the admin
  // reviews a filled-in candidate instead of an empty grid. Re-runs while
  // untouched so it converges once the enum/provider lists finish loading.
  useEffect(() => {
    if (touched) {
      return;
    }
    const seed = normalizeRecord(
      buildPreseededActivePrinting(
        group.candidates,
        printingFields,
        providerSettings,
        providerLabels,
        setReleaseYears,
      ),
    );
    // Bail out when the seed is unchanged so an unstable dep reference can't spin
    // the effect into a render loop (React skips the update when we return `prev`).
    setActivePrinting((prev) => (JSON.stringify(prev) === JSON.stringify(seed) ? prev : seed));
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- normalizeRecord is a render-local closure; its inputs (setTotals, costKeywords, candidates) are in deps
  }, [
    touched,
    group.candidates,
    printingFields,
    providerSettings,
    providerLabels,
    setReleaseYears,
    setTotals,
    costKeywords,
  ]);

  const hasRequired = REQUIRED_PRINTING_KEYS.every((k) => {
    const v = activePrinting[k];
    return v !== undefined && v !== null && v !== "";
  });

  const markerSlugs = Array.isArray(activePrinting.markerSlugs)
    ? (activePrinting.markerSlugs as string[])
    : [];
  const printingLabel = hasRequired
    ? formatPrintingLabel(
        activePrinting.shortCode as string,
        markerSlugs,
        activePrinting.finish as string,
        (activePrinting.language as string | undefined) ?? null,
      )
    : "";

  const guessedId = group.expectedPrintingId;

  // Active values came from the pre-seed and the admin hasn't touched them yet.
  const isPreseeded = !touched && Object.keys(activePrinting).length > 0;

  // The first-provider source image, matching what GroupImagePreview shows by
  // default, so the richText editor's side preview stays consistent with the list.
  const previewImageUrl =
    deduplicateSourceImages(group.candidates, providerLabels).toSorted((a, b) =>
      sortByProviderOrder(providerSettings)(a.source, b.source),
    )[0]?.url ?? null;

  // custom: find existing printing whose expectedPrintingId matches the guessed ID so we can offer a quick "assign all" action
  const matchingExisting = existingPrintings.find((p) => p.expectedPrintingId === guessedId);
  // No exact match: fall back to the server-side suggestion (same code +
  // language, markers/finish may drift). Shown with the target's label so the
  // admin sees what they'd be linking to before clicking.
  const suggestedExisting = matchingExisting
    ? undefined
    : existingPrintings.find((p) => p.id === group.suggestedPrintingId);

  return (
    <div className="overflow-hidden rounded-md border border-dashed">
      {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- contains nested buttons, can't use <button> */}
      <div
        className="flex cursor-pointer flex-wrap items-center gap-3 bg-purple-50 px-3 py-2 hover:opacity-90 dark:bg-purple-950/30"
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
          {isAdmin && group.candidates.some((s) => !s.checkedAt) && (
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
          {isAdmin && matchingExisting && (
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
          {/* custom: near-miss suggestion — same code + language but marker/finish drift; outline styling signals it needs a look before clicking */}
          {isAdmin && suggestedExisting && (
            <Button
              variant="outline"
              disabled={isLinking}
              onClick={() =>
                onLink(
                  suggestedExisting.id,
                  group.candidates.map((s) => s.id),
                )
              }
            >
              <ArrowRightIcon className="mr-1 size-3.5" />
              Assign all to {suggestedExisting.expectedPrintingId}
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
          <div className="flex flex-col gap-3 border-t p-3 lg:flex-row">
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
                costKeywords={costKeywords}
                activeImageUrl={previewImageUrl}
                activeColumnBadge={
                  isPreseeded ? (
                    <Badge variant="warning" className="font-normal">
                      Pre-filled
                    </Badge>
                  ) : null
                }
                normalizeCandidate={normalizePrinting}
                onCellClick={(field, value) => {
                  setTouched(true);
                  setActivePrinting((prev) => withSetTotal({ ...prev, [field]: value }));
                }}
                onActiveChange={(field, value) => {
                  setTouched(true);
                  setActivePrinting((prev) =>
                    value === null || value === undefined
                      ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== field))
                      : withSetTotal({ ...prev, [field]: value }),
                  );
                }}
                onCheck={isAdmin ? (id) => checkPrintingSource.mutate(id) : undefined}
                onUncheck={isAdmin ? (id) => uncheckPrintingSource.mutate(id) : undefined}
                columnActions={
                  <NewPrintingColumnActions
                    existingPrintings={existingPrintings}
                    printingFields={printingFields}
                    onLink={onLink}
                    onCopy={onCopy}
                    onAcceptAllForRow={(_rowId, values) => {
                      setTouched(true);
                      setActivePrinting((prev) =>
                        withSetTotal({ ...prev, ...normalizeRecord(values) }),
                      );
                    }}
                    onIgnore={onIgnore}
                    onDelete={onDelete}
                    isAdmin={isAdmin}
                  />
                }
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
