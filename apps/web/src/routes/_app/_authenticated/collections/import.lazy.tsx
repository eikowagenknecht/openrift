import type { Printing } from "@openrift/shared";
import { sortCards } from "@openrift/shared";
import { useQuery } from "@tanstack/react-query";
import { createLazyFileRoute } from "@tanstack/react-router";
import {
  CheckCircle2Icon,
  ChevronRightIcon,
  DownloadIcon,
  FileUpIcon,
  Loader2Icon,
  UploadIcon,
} from "lucide-react";
import { use, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { Heading } from "@/components/heading";
import { ImportEntryRow } from "@/components/import/import-entry-row";
import { PageTopBar, PageTopBarTitle } from "@/components/layout/page-top-bar";
import {
  SectionHeader,
  SectionHeaderActions,
  SectionHeaderDescription,
  SectionHeaderGroup,
  SectionHeaderTitle,
} from "@/components/section-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
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
import { useSidebar } from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import { useCards } from "@/hooks/use-cards";
import { useCollections } from "@/hooks/use-collections";
import type { ImportableListOption } from "@/hooks/use-import-flow";
import { useImportFlow } from "@/hooks/use-import-flow";
import { useRequiredUserId } from "@/lib/auth-session";
import { copiesQueryOptions } from "@/lib/copies-query";
import { downloadCSV, generateExportCSV, generatePiltoverArchiveCSV } from "@/lib/csv-export";
import type { MatchedEntry } from "@/lib/import-matcher";
import { isReplaceableTarget, LIST_TARGET_PREFIX } from "@/lib/import-replace";
import { SOCIAL_LINKS } from "@/lib/social-links";
import { TopBarSlotContext } from "@/routes/_app/_authenticated/collections/route";

export const Route = createLazyFileRoute("/_app/_authenticated/collections/import")({
  component: ImportExportPage,
});

function ImportExportPage() {
  const { toggleSidebar } = useSidebar();
  const topBarSlot = use(TopBarSlotContext);
  const { data: collections } = useCollections();
  const flow = useImportFlow();

  const topBarPortal =
    topBarSlot &&
    createPortal(
      <PageTopBar>
        <PageTopBarTitle onToggleSidebar={toggleSidebar}>Import / Export</PageTopBarTitle>
      </PageTopBar>,
      topBarSlot,
    );

  if (flow.step === "input") {
    return (
      <div className="space-y-10">
        {topBarPortal}
        <InputStep
          rawText={flow.rawText}
          onTextChange={flow.handleRawTextChange}
          onParse={flow.handleParse}
          onFileUpload={flow.handleFileUpload}
          fileRef={flow.fileRef}
          parseErrors={flow.parseErrors}
        />
        <ExportSection />
      </div>
    );
  }

  return (
    <>
      {topBarPortal}
      <PreviewStep
        matchedEntries={flow.matchedEntries}
        allPrintings={flow.allPrintings}
        rowCount={flow.rowCount}
        parseErrors={flow.parseErrors}
        skippedIndices={flow.skippedIndices}
        expandedIndices={flow.expandedIndices}
        collections={collections ?? []}
        importableLists={flow.importableLists}
        collectionId={flow.collectionId}
        newCollectionName={flow.newCollectionName}
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
        onCollectionChange={flow.handleCollectionChange}
        onNewCollectionNameChange={flow.handleNewCollectionNameChange}
        onImport={flow.handleImport}
        onBack={flow.handleBack}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

function ExportSection() {
  const userId = useRequiredUserId();
  const { data: collections } = useCollections();
  const { allPrintings } = useCards();
  const [exportCollectionId, setExportCollectionId] = useState<string>("__all__");
  const [exportFormat, setExportFormat] = useState<"openrift" | "piltover">("openrift");

  const queryCollectionId = exportCollectionId === "__all__" ? undefined : exportCollectionId;
  const { data: copies, isLoading } = useQuery(copiesQueryOptions(userId, queryCollectionId));

  const handleExport = () => {
    if (!copies) {
      return;
    }

    const printingById = new Map<string, Printing>();
    for (const printing of allPrintings) {
      printingById.set(printing.id, printing);
    }

    // Build stacks grouped by printingId
    const stackMap = new Map<
      string,
      { printingId: string; printing: Printing; copyIds: string[] }
    >();
    for (const copy of copies) {
      const printing = printingById.get(copy.printingId);
      if (!printing) {
        continue;
      }
      const existing = stackMap.get(copy.printingId);
      if (existing) {
        existing.copyIds.push(copy.id);
      } else {
        stackMap.set(copy.printingId, {
          printingId: copy.printingId,
          printing,
          copyIds: [copy.id],
        });
      }
    }

    // Sort by card ID
    const stacks = [...stackMap.values()];
    const sortedPrintings = sortCards(
      stacks.map((stack) => stack.printing),
      "id",
    );
    const byPrintingId = new Map(stacks.map((stack) => [stack.printingId, stack]));
    const sortedStacks = sortedPrintings
      .map((printing) => byPrintingId.get(printing.id))
      .filter(
        (stack): stack is { printingId: string; printing: Printing; copyIds: string[] } =>
          stack !== undefined,
      );

    // Per-copy metadata (ADR-038): each printing exports one row per distinct
    // metadata combination, so conditions and notes survive the round trip.
    const copiesById = new Map(copies.map((copy) => [copy.id, copy]));
    const csv =
      exportFormat === "piltover"
        ? generatePiltoverArchiveCSV(sortedStacks, copiesById)
        : generateExportCSV(sortedStacks, copiesById);

    const collectionName =
      exportCollectionId === "__all__"
        ? "all-cards"
        : (collections?.find((col) => col.id === exportCollectionId)?.name ?? "collection")
            .toLowerCase()
            .replaceAll(/[^a-z0-9]+/gu, "-")
            .replaceAll(/^-|-$/gu, "");

    const date = new Date().toISOString().slice(0, 10);
    const prefix = exportFormat === "piltover" ? "piltover" : "openrift";
    downloadCSV(csv, `${prefix}-${collectionName}-${date}.csv`);
    toast.success("Collection exported.");
  };

  const copyCount = copies?.length ?? 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6 pt-3">
      <div>
        <Heading level={2}>Export Collection</Heading>
        <p className="text-muted-foreground text-sm">
          Download your collection as a CSV file, in OpenRift&apos;s own format or Piltover
          Archive&apos;s.
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium" htmlFor="export-collection">
          Collection
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={exportCollectionId}
            onValueChange={(value) => setExportCollectionId(value ?? "__all__")}
            items={{
              __all__: "All Cards",
              ...Object.fromEntries(collections?.map((col) => [col.id, col.name]) ?? []),
            }}
          >
            <SelectTrigger className="w-[240px]" id="export-collection">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Cards</SelectItem>
              <SelectSeparator />
              {collections?.map((col) => (
                <SelectItem key={col.id} value={col.id}>
                  {col.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={exportFormat}
            onValueChange={(value) =>
              setExportFormat((value as "openrift" | "piltover") ?? "openrift")
            }
            items={{ openrift: "OpenRift CSV", piltover: "Piltover Archive CSV" }}
          >
            <SelectTrigger className="w-[200px]" id="export-format">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="openrift">OpenRift CSV</SelectItem>
              <SelectItem value="piltover">Piltover Archive CSV</SelectItem>
            </SelectContent>
          </Select>

          <Button onClick={handleExport} disabled={isLoading || copyCount === 0}>
            {isLoading ? (
              <>
                <Loader2Icon className="mr-2 size-4 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <DownloadIcon className="mr-2 size-4" />
                Export {copyCount} {copyCount === 1 ? "copy" : "copies"}
              </>
            )}
          </Button>
        </div>

        {exportFormat === "piltover" && (
          <p className="text-muted-foreground text-sm">
            OpenRift tracks some printings Piltover Archive doesn&apos;t, so a few cards may not be
            recognized when you import this file there.
          </p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1: Input
// ---------------------------------------------------------------------------

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
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Heading level={2}>Import Cards</Heading>
        <p className="text-muted-foreground text-sm">
          Paste or upload a CSV export from{" "}
          <a
            href="https://piltoverarchive.com"
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline"
          >
            Piltover Archive
          </a>
          ,{" "}
          <a
            href="https://riftcore.app"
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline"
          >
            RiftCore
          </a>
          ,{" "}
          <a
            href="https://riftmana.com"
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline"
          >
            RiftMana
          </a>
          , or OpenRift itself. You can also paste a plain text list with one{" "}
          <code className="text-foreground">quantity cardname</code> per line. Having trouble or
          need support for another source? Let us know on{" "}
          <a
            href={SOCIAL_LINKS.discordInvite}
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline"
          >
            Discord
          </a>{" "}
          or{" "}
          <a
            href={SOCIAL_LINKS.githubIssues}
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline"
          >
            GitHub
          </a>
          .
        </p>
      </div>

      <div className="space-y-3">
        <Textarea
          value={rawText}
          onChange={(event) => onTextChange(event.target.value)}
          placeholder="Paste CSV data or a plain text list here..."
          className="min-h-[200px] font-mono text-xs"
        />

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => onParse(rawText)} disabled={rawText.trim().length === 0}>
            <UploadIcon className="mr-2 size-4" />
            Parse
          </Button>

          <div className="text-muted-foreground text-sm">or</div>

          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <FileUpIcon className="mr-2 size-4" />
            Upload file
          </Button>
          <Input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,.txt,text/plain"
            onChange={onFileUpload}
            className="hidden"
          />
        </div>
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

// ---------------------------------------------------------------------------
// Step 2: Preview
// ---------------------------------------------------------------------------

interface CollectionOption {
  id: string;
  name: string;
  isInbox: boolean;
  copyCount: number;
}

function PreviewStep({
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
    <div className="mx-auto max-w-3xl space-y-4">
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

      {/* Problematic entries — rendered directly so they're easy to spot */}
      {problematicEntries.length > 0 && (
        <div className="divide-border divide-y rounded-md border">
          {problematicEntries.map((item) => renderRow(item))}
        </div>
      )}

      {/* Parse errors — rows that couldn't be recognized at all */}
      {parseErrors.length > 0 && (
        <details className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-amber-800 dark:text-amber-300">
            {parseErrors.length} {parseErrors.length === 1 ? "row" : "rows"} could not be recognized
          </summary>
          <div className="border-t border-amber-200 px-3 py-2 dark:border-amber-900">
            {parseErrors.map((error) => (
              <p key={error} className="text-sm text-amber-700 dark:text-amber-400">
                {error}
              </p>
            ))}
          </div>
        </details>
      )}

      {/* Exact matches — folded by default so attention stays on what needs action */}
      {exactEntries.length > 0 && (
        <details className="group rounded-md border">
          <summary className="text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-2 px-4 py-2.5 text-sm">
            <ChevronRightIcon className="size-4 transition-transform group-open:rotate-90" />
            <CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-400" />
            <span>{exactEntries.length} matched exactly</span>
          </summary>
          <div className="divide-border divide-y border-t">
            {exactEntries.map((item) => renderRow(item))}
          </div>
        </details>
      )}

      {/* Summary + target collection + import button */}
      <div className="bg-muted/50 space-y-4 rounded-md border p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="success">{readyCount} ready</Badge>
          {toVerifyCount > 0 && <Badge variant="warning">{toVerifyCount} to verify</Badge>}
          {needsAttentionCount > 0 && (
            <Badge variant="destructive">{needsAttentionCount} need attention</Badge>
          )}
          {skippedCount > 0 && <Badge variant="ghost">{skippedCount} skipped</Badge>}
        </div>

        {toVerifyCount > 0 && (
          <p className="text-muted-foreground text-sm">
            We picked a best guess for {toVerifyCount} {toVerifyCount === 1 ? "card" : "cards"}{" "}
            (marked <span className="text-amber-600 dark:text-amber-400">to verify</span>). They
            will import as-is, so open each one to confirm the printing if it matters.
          </p>
        )}

        {needsAttentionCount > 0 && (
          <p className="text-muted-foreground text-sm">
            Having trouble importing?{" "}
            <a
              href={SOCIAL_LINKS.githubIssues}
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline"
            >
              Open a GitHub issue
            </a>{" "}
            and we&apos;ll take a look.
          </p>
        )}

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
            ? "Importing into a list just adds the cards to that list. It does not mark them as owned in your collection."
            : "Importing into a collection marks these cards as owned. To add them to a list without owning them, pick a list instead."}
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
