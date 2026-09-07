import { isAcceptPrintingField } from "@openrift/shared/contracts/admin/card-mutations";
import type {
  AdminPrintingImageResponse,
  AdminPrintingMarketplaceMappingResponse,
  AdminPrintingResponse,
  CandidateCardResponse,
  CandidatePrintingResponse,
  ProviderSettingResponse,
} from "@openrift/shared/types/api/admin";
import { Link } from "@tanstack/react-router";
import {
  CheckCheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  EllipsisVerticalIcon,
  Trash2Icon,
} from "lucide-react";

import { CandidateSpreadsheet } from "@/components/admin/candidate-spreadsheet";
import type { CandidatePrintingFieldKey, FieldDef } from "@/components/admin/candidate-spreadsheet";
import {
  buildPrintingNormalizer,
  deduplicateSourceImages,
  findDerivedArtPrinting,
} from "@/components/admin/card-detail-shared";
import { PrintingCitationsEditor } from "@/components/admin/printing-citations-editor";
import { PrintingIdLabel } from "@/components/admin/printing-id-label";
import type { SiblingImage } from "@/components/admin/printing-image-switcher";
import { PrintingImageSwitcher } from "@/components/admin/printing-image-switcher";
import { PrintingMarketplaceBadges } from "@/components/admin/printing-marketplace-cells";
import { PrintingSourceActions } from "@/components/admin/printing-source-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useAcceptPrintingField,
  useCheckAllCandidatePrintings,
  useCheckCandidatePrinting,
  useCopyCandidatePrinting,
  useDeleteCandidatePrinting,
  useDeletePrinting,
  useLinkCandidatePrintings,
  useUncheckCandidatePrinting,
} from "@/hooks/use-admin-card-mutations";
import { useIgnoreCandidatePrinting } from "@/hooks/use-ignored-candidates";
import type { SourceSubmitter } from "@/lib/candidate-submitter";
import { getStoredCollapsedPrintings, useAdminCardFoldStore } from "@/stores/admin-card-fold-store";

interface PrintingSourceColumnActionsProps {
  row?: CandidateCardResponse | CandidatePrintingResponse;
  targets: { id: string; label: string }[];
  sourceLabels: Record<string, string>;
  onAssign: (input: { candidatePrintingIds: string[]; printingId: string | null }) => void;
  onCopy: (input: { id: string; printingId: string }) => void;
  onIgnore: (input: { provider: string; externalId: string; finish: string | null }) => void;
  onDelete: (id: string) => void;
}

function PrintingSourceColumnActions({
  row,
  targets,
  sourceLabels,
  onAssign,
  onCopy,
  onIgnore,
  onDelete,
}: PrintingSourceColumnActionsProps) {
  if (!row) {
    return null;
  }
  const printingRow = row as CandidatePrintingResponse;
  return (
    <PrintingSourceActions
      targets={targets}
      onAssign={(pid) => onAssign({ candidatePrintingIds: [row.id], printingId: pid })}
      onCopy={(pid) => onCopy({ id: row.id, printingId: pid })}
      onUnassign={() => onAssign({ candidatePrintingIds: [row.id], printingId: null })}
      onIgnore={() =>
        onIgnore({
          provider: sourceLabels[printingRow.candidateCardId] ?? "",
          externalId: row.externalId,
          finish: printingRow.finish,
        })
      }
      onDelete={() => onDelete(row.id)}
    />
  );
}

interface PrintingReviewCardProps {
  printing: AdminPrintingResponse;
  cardId: string;
  printings: AdminPrintingResponse[];
  candidatePrintings: CandidatePrintingResponse[];
  printingImages: AdminPrintingImageResponse[];
  marketplaceMappings: AdminPrintingMarketplaceMappingResponse[];
  sourceLabels: Record<string, string>;
  sourceNames: Record<string, string>;
  /** Keyed by candidate card id; printing rows resolve theirs via their parent. */
  sourceSubmitters: Record<string, SourceSubmitter>;
  providerSettings: ProviderSettingResponse[];
  printingSourceFields: FieldDef<CandidatePrintingFieldKey>[];
  setTotals: Record<string, number>;
  costKeywords: readonly string[];
  invalidates: readonly (readonly unknown[])[];
  /** True only for the card's first printing, so a card never renders every row expanded. */
  defaultExpanded: boolean;
  /** Card-review grant holders only accept fields; triage and delete stay full-admin. */
  isAdmin: boolean;
}

/**
 * The row owns its own mutations and reads its own fold slice so the detail
 * page's `.map()` closes over nothing that changes per render.
 */
export function PrintingReviewCard({
  printing,
  cardId,
  printings,
  candidatePrintings,
  printingImages,
  marketplaceMappings,
  sourceLabels,
  sourceNames,
  sourceSubmitters,
  providerSettings,
  printingSourceFields,
  setTotals,
  costKeywords,
  invalidates,
  defaultExpanded,
  isAdmin,
}: PrintingReviewCardProps) {
  const printingId = printing.id;
  const printingLabel = printing.expectedPrintingId;

  const isExpanded = useAdminCardFoldStore((state) => {
    const collapsed = getStoredCollapsedPrintings(state, cardId);
    return collapsed === undefined ? defaultExpanded : !collapsed.has(printingId);
  });
  const togglePrintingFold = useAdminCardFoldStore((state) => state.togglePrinting);

  const checkAllCandidatePrintings = useCheckAllCandidatePrintings(invalidates);
  const checkPrintingSource = useCheckCandidatePrinting(invalidates);
  const uncheckPrintingSource = useUncheckCandidatePrinting(invalidates);
  const acceptPrintingField = useAcceptPrintingField(invalidates);
  const linkPrintingSources = useLinkCandidatePrintings(invalidates);
  const copyPrintingSource = useCopyCandidatePrinting(invalidates);
  const deletePrintingSource = useDeleteCandidatePrinting(invalidates);
  const deletePrintingMutation = useDeletePrinting(invalidates);
  const ignorePrintingSource = useIgnoreCandidatePrinting();

  const allSources = candidatePrintings.filter((ps) => ps.printingId === printingId);
  const ownImages = printingImages.filter((pi) => pi.printingId === printingId);
  const activeImage = ownImages.find((pi) => pi.isActive);
  const printingWithImage = {
    ...printing,
    imageUrl: activeImage?.originalUrl ?? null,
  };

  const sourceImagesForSwitcher = deduplicateSourceImages(
    allSources.filter(
      (ps) => ps.imageUrl && !ownImages.some((pi) => pi.originalUrl === ps.imageUrl),
    ),
    sourceLabels,
  );

  const uncheckedSources = allSources.filter((ps) => !ps.checkedAt);

  // One entry per underlying image file: the pin stores the file, so a scan shared
  // across printings would otherwise offer the same pin twice.
  const siblingImages: SiblingImage[] = [];
  const seenImageFiles = new Set<string>();
  for (const image of printingImages) {
    if (image.printingId === printingId || seenImageFiles.has(image.imageFileId)) {
      continue;
    }
    seenImageFiles.add(image.imageFileId);
    const owner = printings.find((p) => p.id === image.printingId);
    siblingImages.push({
      imageFileId: image.imageFileId,
      printingLabel: owner?.expectedPrintingId ?? image.printingId,
    });
  }

  const derivedArtPrinting = findDerivedArtPrinting(printing, printings, printingImages);

  return (
    <div data-printing-id={printingId} className="overflow-hidden rounded-md border">
      {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- contains nested buttons, can't use <button> */}
      <div
        className="bg-muted flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium hover:opacity-90"
        onClick={() => togglePrintingFold(cardId, printingId)}
      >
        <span className="flex items-center gap-2">
          {isExpanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
          <PrintingIdLabel label={printingLabel} language={printing.language} />
          <span className="text-muted-foreground font-normal">
            ({allSources.length} source
            {allSources.length === 1 ? "" : "s"})
          </span>
          {!activeImage && (
            <Badge variant="destructive">
              {printing.fallbackArtMode === "pinned" ? "substitute image" : "no image"}
            </Badge>
          )}
          <PrintingMarketplaceBadges printingId={printingId} mappings={marketplaceMappings} />
        </span>
        {isAdmin && uncheckedSources.length > 0 && (
          <Button
            variant="outline"
            disabled={checkAllCandidatePrintings.isPending}
            onClick={(e) => {
              e.stopPropagation();
              checkAllCandidatePrintings.mutate({ printingId });
            }}
          >
            <CheckCheckIcon className="mr-1" />
            Check {uncheckedSources.length} unchecked
          </Button>
        )}
        {isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto"
                  onClick={(e) => e.stopPropagation()}
                />
              }
            >
              <EllipsisVerticalIcon />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                render={
                  <Link
                    to="/admin/cards/$cardSlug/printings/create"
                    params={{ cardSlug: cardId }}
                    search={{ duplicateFrom: printingId }}
                  />
                }
              >
                <CopyIcon className="mr-2" />
                Duplicate printing
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={deletePrintingMutation.isPending}
                onClick={() => {
                  if (
                    globalThis.confirm(`Delete printing "${printingLabel}"? This cannot be undone.`)
                  ) {
                    deletePrintingMutation.mutate(printingId);
                  }
                }}
              >
                <Trash2Icon className="text-destructive mr-2" />
                <span className="text-destructive">Delete</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {isExpanded && (
        <div className="flex flex-col gap-3 border-t p-3 lg:flex-row">
          <PrintingImageSwitcher
            printingId={printingId}
            printingLabel={printingLabel}
            images={ownImages}
            providerSettings={providerSettings}
            sourceImages={sourceImagesForSwitcher}
            siblingImages={siblingImages}
            derivedArtLabel={derivedArtPrinting?.expectedPrintingId ?? null}
            fallbackArtMode={printing.fallbackArtMode}
            fallbackImageFileId={printing.fallbackImageFileId}
            invalidates={invalidates}
            isAdmin={isAdmin}
          />
          <div className="min-w-0 flex-1 space-y-3">
            <CandidateSpreadsheet
              key={allSources.map((s) => s.id).join(",")}
              fields={printingSourceFields}
              activeRow={printingWithImage}
              candidateRows={allSources}
              providerLabels={sourceLabels}
              providerNames={sourceNames}
              submitters={sourceSubmitters}
              providerSettings={providerSettings}
              activeImageUrl={printingWithImage.imageUrl}
              costKeywords={costKeywords}
              normalizeCandidate={buildPrintingNormalizer(
                setTotals,
                printing.setSlug,
                costKeywords,
              )}
              onCellClick={(field, value) => {
                // externalId / extraData / imageUrl are read-only provider
                // columns the accept endpoint does not take.
                if (!isAcceptPrintingField(field)) {
                  return;
                }
                acceptPrintingField.mutate({
                  printingId,
                  field,
                  value,
                  source: "provider",
                });
              }}
              onActiveChange={(field, value) => {
                if (value === undefined || !isAcceptPrintingField(field)) {
                  return;
                }
                acceptPrintingField.mutate({ printingId, field, value });
              }}
              onCheck={isAdmin ? (id) => checkPrintingSource.mutate(id) : undefined}
              onUncheck={isAdmin ? (id) => uncheckPrintingSource.mutate(id) : undefined}
              columnActions={
                isAdmin ? (
                  <PrintingSourceColumnActions
                    targets={printings
                      .filter((p) => p.id !== printingId)
                      .map((p) => ({
                        id: p.id,
                        label: p.expectedPrintingId,
                      }))}
                    sourceLabels={sourceLabels}
                    onAssign={(input) => linkPrintingSources.mutate(input)}
                    onCopy={(input) => copyPrintingSource.mutate(input)}
                    onIgnore={(input) => ignorePrintingSource.mutate(input)}
                    onDelete={(id) => deletePrintingSource.mutate(id)}
                  />
                ) : undefined
              }
            />
            {isAdmin && <PrintingCitationsEditor printingId={printingId} />}
          </div>
        </div>
      )}
    </div>
  );
}
