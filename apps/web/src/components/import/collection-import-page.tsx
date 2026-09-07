import { use } from "react";
import { createPortal } from "react-dom";

import { CollectionExportSection } from "@/components/import/collection-export-section";
import { CollectionImportInputStep } from "@/components/import/collection-import-input-step";
import { CollectionImportPreviewStep } from "@/components/import/collection-import-preview-step";
import { PageTopBar, PageTopBarTitle } from "@/components/layout/page-top-bar";
import { TopBarSlotContext } from "@/components/layout/top-bar-slot";
import { useSidebar } from "@/components/ui/sidebar";
import { useCollections } from "@/hooks/use-collections";
import { useImportFlow } from "@/hooks/use-import-flow";

export function CollectionImportPage() {
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
      <div className="space-y-10 pt-3">
        {topBarPortal}
        <CollectionImportInputStep
          rawText={flow.rawText}
          onTextChange={flow.handleRawTextChange}
          onParse={flow.handleParse}
          onFileUpload={flow.handleFileUpload}
          fileRef={flow.fileRef}
          parseErrors={flow.parseErrors}
        />
        <CollectionExportSection />
      </div>
    );
  }

  return (
    <>
      {topBarPortal}
      <CollectionImportPreviewStep
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
        onImport={(options) => void flow.handleImport(options)}
        onBack={flow.handleBack}
      />
    </>
  );
}
