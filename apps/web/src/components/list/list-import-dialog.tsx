import type { Printing } from "@openrift/shared";
import {
  CheckCircle2Icon,
  ChevronRightIcon,
  FileUpIcon,
  Loader2Icon,
  UploadIcon,
} from "lucide-react";
import { useEffect } from "react";

import { ImportEntryRow } from "@/components/import/import-entry-row";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useListImportFlow } from "@/hooks/use-list-import-flow";
import type { MatchedEntry } from "@/lib/import-matcher";

interface ListImportDialogProps {
  listId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ListImportDialog({ listId, open, onOpenChange }: ListImportDialogProps) {
  const flow = useListImportFlow(listId, () => onOpenChange(false));

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
            Paste a plain-text list with one card per line in the format{" "}
            <code className="bg-muted rounded px-1 py-0.5 text-xs">
              &lt;quantity&gt; &lt;card name&gt;
            </code>
            . Matching cards are added to this list; quantities stack with what&apos;s already
            there.
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
            needsAttentionCount={flow.needsAttentionCount}
            skippedCount={flow.skippedCount}
            totalCards={flow.totalCards}
            isImporting={flow.isImporting}
            onResolve={flow.handleResolve}
            onSkip={flow.handleSkip}
            onUnskip={flow.handleUnskip}
            onToggleExpand={flow.handleToggleExpand}
            onImport={flow.handleImport}
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
}: {
  rawText: string;
  onTextChange: (text: string) => void;
  onParse: (text: string) => void;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  parseErrors: string[];
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Textarea
        value={rawText}
        onChange={(event) => onTextChange(event.target.value)}
        placeholder={"1 Teemo, Scout\n3 Jinx, Rebel"}
        className="min-h-[200px] font-mono text-xs"
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
        <Button onClick={() => onParse(rawText)} disabled={rawText.trim().length === 0}>
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
  needsAttentionCount,
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
  needsAttentionCount: number;
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
  const problematicEntries: { entry: MatchedEntry; index: number }[] = [];
  const exactEntries: { entry: MatchedEntry; index: number }[] = [];
  for (const [index, entry] of matchedEntries.entries()) {
    if (entry.status === "exact") {
      exactEntries.push({ entry, index });
    } else {
      problematicEntries.push({ entry, index });
    }
  }

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

      {parseErrors.length > 0 && (
        <details className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
          <summary className="cursor-pointer px-3 py-2 font-medium text-amber-800 dark:text-amber-300">
            {parseErrors.length} line{parseErrors.length === 1 ? "" : "s"} couldn&apos;t be read
          </summary>
          <div className="border-t border-amber-200 px-3 py-2 dark:border-amber-900">
            {parseErrors.map((error) => (
              <p key={error} className="text-amber-700 dark:text-amber-400">
                {error}
              </p>
            ))}
          </div>
        </details>
      )}

      {exactEntries.length > 0 && (
        <details className="group rounded-md border">
          <summary className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-2 px-4 py-2.5">
            <ChevronRightIcon className="size-4 transition-transform group-open:rotate-90" />
            <CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-400" />
            <span>{exactEntries.length} matched exactly</span>
          </summary>
          <div className="divide-border divide-y border-t">
            {exactEntries.map((item) => renderRow(item))}
          </div>
        </details>
      )}

      <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{readyCount} ready</Badge>
          {needsAttentionCount > 0 && (
            <Badge variant="default">{needsAttentionCount} need attention</Badge>
          )}
          {skippedCount > 0 && <Badge variant="ghost">{skippedCount} skipped</Badge>}
        </div>

        <Button onClick={onImport} disabled={readyCount === 0 || isImporting}>
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
  );
}
