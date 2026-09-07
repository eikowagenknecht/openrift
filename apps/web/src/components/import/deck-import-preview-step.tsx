import { linkHostLabel } from "@openrift/shared/link-hosts";
import type { DeckFormatConfig } from "@openrift/shared/types/api/deck";
import type { Printing } from "@openrift/shared/types/catalog";
import type { DeckFormat, DeckZone } from "@openrift/shared/types/enums";
import { ArrowLeftIcon, ExternalLinkIcon, Loader2Icon } from "lucide-react";

import { DeckImportSummary } from "@/components/deck/deck-import-summary";
import { DeckImportEntryRow } from "@/components/import/deck-import-entry-row";
import {
  ImportStatusBadges,
  ImportToVerifyNote,
  ImportTroubleNote,
} from "@/components/import/import-preview-chrome";
import {
  PageDescription,
  PageTopBar,
  PageTopBarIconButton,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { Accordion } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChipRemoveButton } from "@/components/ui/chip-remove-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-is-mobile";
import type { ImportedDeckCard } from "@/lib/deck-import-cards";
import { DEFAULT_IMPORT_DECK_NAME } from "@/lib/deck-import-cards";
import type { DeckMatchedEntry, ResolvedCard } from "@/lib/deck-import-matcher";
import { deckImportRowId } from "@/lib/deck-import-preview";
import { classifyBucket } from "@/lib/import-summary";
import { cn, PAGE_PADDING_NO_TOP, PAGE_WIDTH } from "@/lib/utils";

export function DeckImportPreviewStep({
  matchedEntries,
  allPrintings,
  parseWarnings,
  sourceNote,
  skippedIndices,
  expandedValues,
  deckName,
  deckFormat,
  deckFormats,
  deckFormatLabels,
  zoneOrder,
  zoneLabels,
  readyCount,
  toVerifyCount,
  needsAttentionCount,
  importableCount,
  skippedCount,
  totalCards,
  importCards,
  summaryFormat,
  summaryFormatConfig,
  isLoggedIn,
  isImporting,
  replaceDeckName,
  sourceLink,
  onDropSourceLink,
  onResolve,
  onZoneChange,
  onSkip,
  onUnskip,
  onExpandedValuesChange,
  onDeckNameChange,
  onDeckFormatChange,
  onImport,
  onBack,
}: {
  matchedEntries: DeckMatchedEntry[];
  allPrintings: Printing[];
  parseWarnings: string[];
  sourceNote: string | null;
  skippedIndices: Set<number>;
  expandedValues: string[];
  deckName: string;
  deckFormat: DeckFormat;
  deckFormats: { slug: string; label: string }[];
  deckFormatLabels: Record<string, string>;
  zoneOrder: DeckZone[];
  zoneLabels: Record<DeckZone, string>;
  readyCount: number;
  toVerifyCount: number;
  needsAttentionCount: number;
  importableCount: number;
  skippedCount: number;
  totalCards: number;
  importCards: ImportedDeckCard[];
  summaryFormat: DeckFormat;
  summaryFormatConfig: DeckFormatConfig | null;
  isLoggedIn: boolean;
  isImporting: boolean;
  replaceDeckName?: string;
  sourceLink?: string;
  onDropSourceLink: () => void;
  onResolve: (index: number, card: ResolvedCard) => void;
  onZoneChange: (index: number, zone: DeckZone) => void;
  onSkip: (index: number) => void;
  onUnskip: (index: number) => void;
  onExpandedValuesChange: (values: string[]) => void;
  onDeckNameChange: (name: string) => void;
  onDeckFormatChange: (format: DeckFormat) => void;
  onImport: () => void;
  onBack: () => void;
}) {
  const isReplaceMode = replaceDeckName !== undefined;
  const canImport = importableCount > 0;
  const isMobile = useIsMobile();

  const jumpToFirstNeedsAttention = () => {
    const index = matchedEntries.findIndex(
      (entry, entryIndex) =>
        !skippedIndices.has(entryIndex) &&
        classifyBucket(entry.status, entry.resolvedCard !== null) === "need-attention",
    );
    if (index === -1) {
      return;
    }
    document
      .querySelector(`#${deckImportRowId(index)}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const importButton = (
    <Button
      variant={isReplaceMode ? "destructive" : "default"}
      onClick={onImport}
      disabled={!canImport || isImporting}
      className="w-full sm:w-auto"
    >
      {isImporting ? (
        <>
          <Loader2Icon className="mr-2 size-4 animate-spin" />
          {isReplaceMode ? "Replacing..." : "Importing..."}
        </>
      ) : isReplaceMode ? (
        <>
          Replace with {totalCards} {totalCards === 1 ? "card" : "cards"}
        </>
      ) : (
        <>
          Import {totalCards} {totalCards === 1 ? "card" : "cards"}
        </>
      )}
    </Button>
  );

  return (
    <>
      <PageTopBarSticky width="capped">
        <PageTopBar>
          <PageTopBarIconButton aria-label="Back" className="mr-1 -ml-2" onClick={onBack}>
            <ArrowLeftIcon />
          </PageTopBarIconButton>
          <PageTopBarTitle>{isReplaceMode ? "Replace Preview" : "Import Preview"}</PageTopBarTitle>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn(PAGE_WIDTH.capped, "space-y-4 pt-3", PAGE_PADDING_NO_TOP)}>
        <PageDescription>
          {matchedEntries.length} card{matchedEntries.length === 1 ? "" : "s"} parsed
          {sourceNote ? ` (${sourceNote})` : null}
        </PageDescription>

        <DeckImportSummary
          cards={importCards}
          format={summaryFormat}
          formatConfig={summaryFormatConfig}
          deckName={replaceDeckName || deckName.trim() || DEFAULT_IMPORT_DECK_NAME}
          isLoggedIn={isLoggedIn}
        />

        <Accordion
          multiple
          value={expandedValues}
          onValueChange={(value) => onExpandedValuesChange(value as string[])}
          className="divide-border divide-y rounded-md border"
        >
          {matchedEntries.map((entry, index) => (
            <DeckImportEntryRow
              key={`${entry.entry.shortCode ?? entry.entry.cardName ?? ""}-${entry.zone}-${index}`}
              entry={entry}
              allPrintings={allPrintings}
              index={index}
              zoneOrder={zoneOrder}
              zoneLabels={zoneLabels}
              isSkipped={skippedIndices.has(index)}
              onResolve={onResolve}
              onZoneChange={onZoneChange}
              onSkip={onSkip}
              onUnskip={onUnskip}
            />
          ))}
        </Accordion>

        {parseWarnings.length > 0 && (
          <Alert variant="warning">
            <AlertTitle>
              {parseWarnings.length} warning{parseWarnings.length === 1 ? "" : "s"} while parsing
            </AlertTitle>
            <AlertDescription>
              {parseWarnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </AlertDescription>
          </Alert>
        )}

        <div className="bg-muted/30 space-y-4 rounded-md border p-4">
          <ImportStatusBadges
            readyCount={readyCount}
            toVerifyCount={toVerifyCount}
            needsAttentionCount={needsAttentionCount}
            skippedCount={skippedCount}
            onJumpToNeedsAttention={jumpToFirstNeedsAttention}
          />

          <ImportToVerifyNote count={toVerifyCount} />

          <ImportTroubleNote needsAttentionCount={needsAttentionCount} />

          {sourceLink !== undefined && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Save a link to</span>
              <Badge variant="outline" title={sourceLink}>
                <ExternalLinkIcon className="size-3" />
                {linkHostLabel(sourceLink) ?? sourceLink}
                <ChipRemoveButton
                  aria-label="Don't save the source link"
                  onClick={onDropSourceLink}
                />
              </Badge>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            {!isReplaceMode && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="preview-deck-name">Deck name</Label>
                  <Input
                    id="preview-deck-name"
                    value={deckName}
                    onChange={(event) => onDeckNameChange(event.target.value)}
                    placeholder={DEFAULT_IMPORT_DECK_NAME}
                    className="w-full sm:w-[200px]"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="preview-deck-format">Format</Label>
                  <Select
                    value={deckFormat}
                    onValueChange={(value) => {
                      if (value !== null) {
                        onDeckFormatChange(value);
                      }
                    }}
                  >
                    <SelectTrigger id="preview-deck-format" className="mb-0 w-full sm:w-[140px]">
                      <SelectValue>
                        {(value: string) => deckFormatLabels[value] ?? value}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {deckFormats.map((entry) => (
                        <SelectItem key={entry.slug} value={entry.slug}>
                          {entry.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {!isMobile && importButton}
            {needsAttentionCount > 0 && !isImporting && (
              <span className="text-muted-foreground text-sm">
                (skips {needsAttentionCount} unmatched)
              </span>
            )}
          </div>
        </div>

        {isMobile && (
          <div className="bg-background/80 mx-safe-neg px-safe pb-safe sticky bottom-0 z-20 pt-2 backdrop-blur-lg">
            {importButton}
          </div>
        )}
      </div>
    </>
  );
}
