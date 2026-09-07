import type { Printing } from "@openrift/shared/types/catalog";
import { Loader2Icon } from "lucide-react";
import { useState } from "react";

import {
  SectionHeader,
  SectionHeaderActions,
  SectionHeaderDescription,
  SectionHeaderGroup,
  SectionHeaderTitle,
} from "@/components/section-header";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImportEntryRow } from "@/features/collections/components/import-entry-row";
import {
  ImportExactMatchesDisclosure,
  ImportParseErrorDetails,
  ImportStatusBadges,
  ImportToVerifyNote,
  ImportTroubleNote,
} from "@/features/collections/components/import-preview-chrome";
import type { ImportableListOption } from "@/features/collections/hooks/use-import-flow";
import type { MatchedEntry } from "@/features/collections/lib/import-matcher";
import { isReplaceableTarget, LIST_TARGET_PREFIX } from "@/features/collections/lib/import-replace";
import { partitionMatchedEntries } from "@/features/collections/lib/import-summary";
import { cn, PAGE_WIDTH } from "@/lib/utils";

export interface CollectionOption {
  id: string;
  name: string;
  isInbox: boolean;
  copyCount: number;
}

export function CollectionImportPreviewStep({
  matchedEntries,
  allPrintings,
  rowCount,
  parseErrors,
  skippedIndices,
  expandedIndices,
  collections,
  importableLists,
  collectionId,
  newCollectionName,
  readyCount,
  toVerifyCount,
  needsAttentionCount,
  importableCount,
  skippedCount,
  totalCards,
  isImporting,
  onResolve,
  onSkip,
  onUnskip,
  onToggleExpand,
  onCollectionChange,
  onNewCollectionNameChange,
  onImport,
  onBack,
}: {
  matchedEntries: MatchedEntry[];
  allPrintings: Printing[];
  rowCount: number;
  parseErrors: string[];
  skippedIndices: Set<number>;
  expandedIndices: Set<number>;
  collections: CollectionOption[];
  importableLists: ImportableListOption[];
  collectionId: string;
  newCollectionName: string;
  readyCount: number;
  toVerifyCount: number;
  needsAttentionCount: number;
  importableCount: number;
  skippedCount: number;
  totalCards: number;
  isImporting: boolean;
  onResolve: (index: number, printing: Printing) => void;
  onSkip: (index: number) => void;
  onUnskip: (index: number) => void;
  onToggleExpand: (index: number) => void;
  onCollectionChange: (id: string) => void;
  onNewCollectionNameChange: (name: string) => void;
  onImport: (options?: { replaceExisting?: boolean }) => void;
  onBack: () => void;
}) {
  const [replaceDialogOpen, setReplaceDialogOpen] = useState(false);
  const targetCollection = collections.find((col) => col.id === collectionId);
  const targetCopyCount = targetCollection?.copyCount ?? 0;
  const targetCopyUnit = targetCopyCount === 1 ? "copy" : "copies";
  // A non-empty existing collection is the only case that needs the add/replace
  // question — new collections start empty and lists are additive only.
  const promptsForReplace = isReplaceableTarget(collectionId, collections);
  const isListTarget = collectionId.startsWith(LIST_TARGET_PREFIX);
  const canImport =
    importableCount > 0 &&
    collectionId !== "" &&
    (collectionId !== "__new__" || newCollectionName.trim().length > 0);
  const importVerb = isListTarget ? "Add" : "Import";
  const importUnit = isListTarget
    ? totalCards === 1
      ? "card"
      : "cards"
    : totalCards === 1
      ? "copy"
      : "copies";

  const { problematicEntries, exactEntries } = partitionMatchedEntries(matchedEntries);

  const renderRow = ({ entry, index }: { entry: MatchedEntry; index: number }) => (
    <ImportEntryRow
      key={`${entry.entry.sourceCode}-${entry.entry.finish}-${index}`}
      entry={entry}
      allPrintings={allPrintings}
      index={index}
      isSkipped={skippedIndices.has(index)}
      isExpanded={expandedIndices.has(index)}
      onResolve={onResolve}
      onSkip={onSkip}
      onUnskip={onUnskip}
      onToggleExpand={onToggleExpand}
    />
  );

  return (
    <div className={cn(PAGE_WIDTH.capped, "space-y-4 pt-3")}>
      <SectionHeader>
        <SectionHeaderGroup>
          <SectionHeaderTitle>Import Preview</SectionHeaderTitle>
          <SectionHeaderDescription>
            {rowCount} row{rowCount === 1 ? "" : "s"} parsed, {matchedEntries.length} unique
            printing{matchedEntries.length === 1 ? "" : "s"}
          </SectionHeaderDescription>
        </SectionHeaderGroup>
        <SectionHeaderActions>
          <Button variant="outline" size="sm" onClick={onBack}>
            Back
          </Button>
        </SectionHeaderActions>
      </SectionHeader>

      {problematicEntries.length > 0 && (
        <div className="divide-border divide-y rounded-md border">
          {problematicEntries.map((item) => renderRow(item))}
        </div>
      )}

      <ImportParseErrorDetails errors={parseErrors} unit="row" />

      <ImportExactMatchesDisclosure count={exactEntries.length}>
        {exactEntries.map((item) => renderRow(item))}
      </ImportExactMatchesDisclosure>

      <div className="bg-muted/30 space-y-4 rounded-md border p-4">
        <ImportStatusBadges
          readyCount={readyCount}
          toVerifyCount={toVerifyCount}
          needsAttentionCount={needsAttentionCount}
          skippedCount={skippedCount}
        />

        <ImportToVerifyNote count={toVerifyCount} />

        <ImportTroubleNote needsAttentionCount={needsAttentionCount} />

        <div className="flex flex-wrap items-end gap-3">
          <Select
            value={collectionId}
            onValueChange={(value) => onCollectionChange(value ?? "")}
            items={{
              ...Object.fromEntries(collections.map((col) => [col.id, col.name])),
              __new__: "+ Create new collection",
              ...Object.fromEntries(
                importableLists.map((list) => [`${LIST_TARGET_PREFIX}${list.id}`, list.name]),
              ),
            }}
          >
            <SelectTrigger className="mb-0 w-[240px]">
              <SelectValue placeholder="Choose a destination..." />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Collections</SelectLabel>
                {collections.map((col) => (
                  <SelectItem key={col.id} value={col.id}>
                    {col.name}
                  </SelectItem>
                ))}
                <SelectItem value="__new__">+ Create new collection</SelectItem>
              </SelectGroup>
              {importableLists.length > 0 && (
                <>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>Lists</SelectLabel>
                    {importableLists.map((list) => (
                      <SelectItem key={list.id} value={`${LIST_TARGET_PREFIX}${list.id}`}>
                        {list.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </>
              )}
            </SelectContent>
          </Select>

          {collectionId === "__new__" && (
            <div className="flex items-center gap-2">
              <label
                className="text-sm font-medium whitespace-nowrap"
                htmlFor="new-collection-name"
              >
                Collection name
              </label>
              <Input
                id="new-collection-name"
                value={newCollectionName}
                onChange={(event) => onNewCollectionNameChange(event.target.value)}
                placeholder="My imported cards"
                className="w-[240px]"
              />
            </div>
          )}

          <Button
            onClick={() => (promptsForReplace ? setReplaceDialogOpen(true) : onImport())}
            disabled={!canImport || isImporting}
          >
            {isImporting ? (
              <>
                <Loader2Icon className="mr-2 size-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                {importVerb} {totalCards} {importUnit}
              </>
            )}
          </Button>
          {needsAttentionCount > 0 && !isImporting && (
            <span className="text-muted-foreground text-sm">
              (skips {needsAttentionCount} unmatched)
            </span>
          )}
        </div>

        <p className="text-muted-foreground text-sm">
          {isListTarget
            ? "Importing into a list just adds the cards to that list."
            : "Importing into a collection marks these cards as owned."}
        </p>
      </div>

      <AlertDialog open={replaceDialogOpen} onOpenChange={setReplaceDialogOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>
            {targetCollection?.name} already has {targetCopyCount} {targetCopyUnit}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Add the imported copies on top of what&apos;s already there, or replace everything with
            just the import?
          </AlertDialogDescription>
          <div className="flex flex-col justify-end gap-2 pt-2 sm:flex-row">
            <Button variant="ghost" onClick={() => setReplaceDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setReplaceDialogOpen(false);
                onImport({ replaceExisting: false });
              }}
            >
              Add to it
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setReplaceDialogOpen(false);
                onImport({ replaceExisting: true });
              }}
            >
              Replace all {targetCopyCount}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
