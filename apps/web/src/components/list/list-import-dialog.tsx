import type { Printing } from "@openrift/shared";
import { FileUpIcon, Loader2Icon, UploadIcon } from "lucide-react";
import { useEffect } from "react";

import { ImportEntryRow } from "@/components/import/import-entry-row";
import type { ImportInputStepProps } from "@/components/import/import-input-step-props";
import {
  ImportExactMatchesDisclosure,
  ImportParseErrorDetails,
  ImportStatusBadges,
} from "@/components/import/import-preview-chrome";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ImportableListKind } from "@/hooks/use-list-import-flow";
import { useListImportFlow } from "@/hooks/use-list-import-flow";
import type { MatchedEntry } from "@/lib/import-matcher";
import { partitionMatchedEntries } from "@/lib/import-summary";

interface ListImportDialogProps {
  listId: string;
  listKind: ImportableListKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ListImportDialog({ listId, listKind, open, onOpenChange }: ListImportDialogProps) {
  const flow = useListImportFlow(listId, listKind, () => onOpenChange(false));

  // Each open of the dialog is a fresh session — clear stale parse results
  // from a previous attempt so the user doesn't see them.
  useEffect(() => {
    if (!open) {
      flow.reset();
    }
    // Only react to the open flag; flow.reset is stable enough for this purpose
    // and re-running on every render would clobber the active session.
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- intentional, see above
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import list</DialogTitle>
          <DialogDescription>
            Paste a CSV export or a plain list (
            <code className="bg-muted rounded px-1 py-0.5 text-xs">
              &lt;quantity&gt; &lt;card name&gt;
            </code>{" "}
            per line).{" "}
            {listKind === "printing"
              ? "Rows without enough detail to pin a printing are flagged for review."
              : "Quantities stack with what's already there."}
          </DialogDescription>
        </DialogHeader>

        {flow.step === "input" ? (
          <InputStep
            rawText={flow.rawText}
            onTextChange={flow.handleRawTextChange}
            onParse={flow.handleParse}
            onFileUpload={flow.handleFileUpload}
            fileRef={flow.fileRef}
            parseErrors={flow.parseErrors}
          />
        ) : (
          <PreviewStep
            matchedEntries={flow.matchedEntries}
            allPrintings={flow.allPrintings}
            rowCount={flow.rowCount}
            parseErrors={flow.parseErrors}
            skippedIndices={flow.skippedIndices}
            expandedIndices={flow.expandedIndices}
            readyCount={flow.readyCount}
            toVerifyCount={flow.toVerifyCount}
            needsAttentionCount={flow.needsAttentionCount}
            importableCount={flow.importableCount}
            skippedCount={flow.skippedCount}
            totalCards={flow.totalCards}
            isImporting={flow.isImporting}
            onResolve={flow.handleResolve}
            onSkip={flow.handleSkip}
            onUnskip={flow.handleUnskip}
            onToggleExpand={flow.handleToggleExpand}
            onImport={() => void flow.handleImport()}
            onBack={flow.handleBack}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function InputStep({
  rawText,
  onTextChange,
  onParse,
  onFileUpload,
  fileRef,
  parseErrors,
}: ImportInputStepProps) {
  return (
    <DialogForm onSubmit={() => onParse(rawText)}>
      <div className="flex min-w-0 flex-col gap-3">
        <Textarea
          value={rawText}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder={"1 Teemo, Scout\n3 Jinx, Rebel"}
          // text-base below md: iOS Safari zooms the viewport when a focused
          // field is under 16px, and there is no maximum-scale to stop it.
          className="min-h-[200px] font-mono text-base md:text-xs"
        />

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <FileUpIcon className="size-4" />
            Upload file
          </Button>
          <Input
            ref={fileRef}
            type="file"
            accept=".txt,.csv,text/plain,text/csv"
            onChange={onFileUpload}
            className="hidden"
          />
          <Button type="submit" disabled={rawText.trim().length === 0}>
            <UploadIcon className="size-4" />
            Parse
          </Button>
        </div>

        {parseErrors.length > 0 && (
          <Alert variant="destructive">
            <AlertDescription>
              {parseErrors.map((error) => (
                <p key={error}>{error}</p>
              ))}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </DialogForm>
  );
}

function PreviewStep({
  matchedEntries,
  allPrintings,
  rowCount,
  parseErrors,
  skippedIndices,
  expandedIndices,
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
  onImport,
  onBack,
}: {
  matchedEntries: MatchedEntry[];
  allPrintings: Printing[];
  rowCount: number;
  parseErrors: string[];
  skippedIndices: Set<number>;
  expandedIndices: Set<number>;
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
  onImport: () => void;
  onBack: () => void;
}) {
  const { problematicEntries, exactEntries } = partitionMatchedEntries(matchedEntries);

  const renderRow = ({ entry, index }: { entry: MatchedEntry; index: number }) => (
    <ImportEntryRow
      key={`${entry.entry.cardName}-${index}`}
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
    <DialogForm onSubmit={onImport}>
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            {rowCount} line{rowCount === 1 ? "" : "s"} parsed, {matchedEntries.length} unique card
            {matchedEntries.length === 1 ? "" : "s"}
          </p>
          <Button variant="outline" size="sm" onClick={onBack}>
            Back
          </Button>
        </div>

        {problematicEntries.length > 0 && (
          <div className="divide-border divide-y rounded-md border">
            {problematicEntries.map((item) => renderRow(item))}
          </div>
        )}

        <ImportParseErrorDetails errors={parseErrors} unit="line" />

        <ImportExactMatchesDisclosure count={exactEntries.length}>
          {exactEntries.map((item) => renderRow(item))}
        </ImportExactMatchesDisclosure>

        <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
          <ImportStatusBadges
            readyCount={readyCount}
            toVerifyCount={toVerifyCount}
            needsAttentionCount={needsAttentionCount}
            skippedCount={skippedCount}
          />

          <Button type="submit" disabled={importableCount === 0 || isImporting}>
            {isImporting ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                Add {totalCards} {totalCards === 1 ? "card" : "cards"}
              </>
            )}
          </Button>
        </div>
      </div>
    </DialogForm>
  );
}
