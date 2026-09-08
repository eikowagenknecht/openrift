import type { Printing } from "@openrift/shared/types/catalog";
import { getOrientation, legendDisplayName } from "@openrift/shared/utils";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { CardDetailOverlayProvider } from "@/features/cards/components/card-detail-opener";
import { useCards } from "@/features/cards/hooks/use-cards";
import { TakeWishlistFollowUpDialog } from "@/features/collections/components/take-wishlist-followup-dialog";
import { useCollections } from "@/features/collections/hooks/use-collections";
import { ScanChrome } from "@/features/scan/components/scan-chrome";
import { ScanClearDialog } from "@/features/scan/components/scan-clear-dialog";
import { ScanControls } from "@/features/scan/components/scan-controls";
import type { ScanFlight } from "@/features/scan/components/scan-flight-layer";
import { ScanFlightLayer } from "@/features/scan/components/scan-flight-layer";
import { ScanIdentifySheet } from "@/features/scan/components/scan-identify-sheet";
import { ScanNotices } from "@/features/scan/components/scan-notices";
import { ScanPrintingPicker } from "@/features/scan/components/scan-printing-picker";
import { ScanResumeCallout } from "@/features/scan/components/scan-resume-callout";
import { ScanSessionTray } from "@/features/scan/components/scan-session-tray";
import { ScanStage } from "@/features/scan/components/scan-stage";
import { ScanTopBar } from "@/features/scan/components/scan-top-bar";
import { ScanViewfinder } from "@/features/scan/components/scan-viewfinder";
import { useCardScanner } from "@/features/scan/hooks/use-card-scanner";
import { useScanAdd } from "@/features/scan/hooks/use-scan-add";
import { useScanBank } from "@/features/scan/hooks/use-scan-bank";
import { useScanClear } from "@/features/scan/hooks/use-scan-clear";
import { useScanIdentify } from "@/features/scan/hooks/use-scan-identify";
import { useScanLayout } from "@/features/scan/hooks/use-scan-layout";
import { useScanSessionRestore } from "@/features/scan/hooks/use-scan-session-restore";
import { useScanSuggestion } from "@/features/scan/hooks/use-scan-suggestion";
import { useScanSwap } from "@/features/scan/hooks/use-scan-swap";
import { ghostConfidence } from "@/features/scan/lib/scan-confidence";
import { playLockTick } from "@/features/scan/lib/scan-feedback";
import { guideRectIn, snapshotVideoRect } from "@/features/scan/lib/scan-flight";
import type { IdentifyCandidate } from "@/features/scan/lib/scan-identify";
import { appendScanJournal } from "@/features/scan/lib/scan-journal";
import { ANY_LANGUAGE, scanLanguageItems } from "@/features/scan/lib/scan-language-items";
import type { LockedCard } from "@/features/scan/lib/scan-locks";
import type { PickerRequest } from "@/features/scan/lib/scan-resolve";
import { buildScanPrintingIndex, resolveLock } from "@/features/scan/lib/scan-resolve";
import { describeLastScan, shouldPromptResume } from "@/features/scan/lib/scan-resume";
import type { ScannerMode, ScannerSettings } from "@/features/scan/lib/scan-session";
import { DEFAULT_SCANNER_SETTINGS } from "@/features/scan/lib/scan-session";
import { useScanPrefsStore } from "@/features/scan/stores/scan-prefs-store";
import type { ScanSessionRow } from "@/features/scan/stores/scan-session-store";
import { useScanSessionStore } from "@/features/scan/stores/scan-session-store";
import { useCoarsePointer } from "@/hooks/use-coarse-pointer";
import { useLanguageLabels } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";

function recordScanned(printing: Printing): void {
  useScanSessionStore.getState().add(printing);
  appendScanJournal({ type: "scan", printingId: printing.id });
}

export function ScanPage() {
  const { allPrintings } = useCards();
  const { data: collections } = useCollections();

  const muted = useScanPrefsStore((state) => state.muted);
  const setMuted = useScanPrefsStore((state) => state.setMuted);
  const destinationId = useScanPrefsStore((state) => state.destinationCollectionId);
  const setDestinationId = useScanPrefsStore((state) => state.setDestinationCollectionId);
  const cardLanguage = useScanPrefsStore((state) => state.cardLanguage);
  const setCardLanguage = useScanPrefsStore((state) => state.setCardLanguage);
  const autoScan = useScanPrefsStore((state) => state.autoScan);
  const setAutoScan = useScanPrefsStore((state) => state.setAutoScan);
  const tapToScan = useScanPrefsStore((state) => state.tapToScan);
  const setTapToScan = useScanPrefsStore((state) => state.setTapToScan);
  const languageLabels = useLanguageLabels();

  const destination =
    collections.find((collection) => collection.id === destinationId) ??
    collections.find((collection) => collection.isInbox) ??
    collections[0] ??
    null;

  const languageItems = scanLanguageItems(allPrintings, cardLanguage, languageLabels);

  useScanSessionRestore(allPrintings);

  const resumed = useScanSessionStore((state) => state.resumed);
  const resumeNotice =
    resumed !== null && shouldPromptResume(resumed.lastScanAt)
      ? { cards: resumed.cards, when: describeLastScan(resumed.lastScanAt) }
      : null;

  const [settings, setSettings] = useState<ScannerSettings>(DEFAULT_SCANNER_SETTINGS);
  // Null until hydration: reading navigator during SSR would mismatch server/client markup.
  const hydrated = useHydrated();
  const cameraAvailable = hydrated ? navigator.mediaDevices?.getUserMedia !== undefined : null;

  const { assets, loaded, unavailableMessage } = useScanBank();

  const index = loaded ? buildScanPrintingIndex(allPrintings, loaded) : null;

  const [pickerQueue, setPickerQueue] = useState<PickerRequest[]>([]);

  const [flights, setFlights] = useState<ScanFlight[]>([]);
  const flightSeqRef = useRef(0);

  const [detailOpen, setDetailOpen] = useState(false);

  // Decoration only: a missing video, unmeasurable box, or tainted canvas
  // just means no flight, never a failed add.
  function launchFlight() {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    const box = video.getBoundingClientRect();
    const guide = guideRectIn({ width: box.width, height: box.height });
    const image = snapshotVideoRect(video, guide);
    if (image === null) {
      return;
    }
    flightSeqRef.current += 1;
    const flight: ScanFlight = {
      id: `flight-${flightSeqRef.current}`,
      image,
      source: {
        x: box.left + guide.x,
        y: box.top + guide.y,
        width: guide.width,
        height: guide.height,
      },
    };
    setFlights((current) => [...current, flight]);
  }

  function handleLock(lock: Pick<LockedCard, "key" | "artKey" | "label" | "resolved">) {
    // With auto-scan, a card left in the guide would keep counting while the detail is open.
    if (detailOpen) {
      return;
    }
    if (!index) {
      return;
    }
    const resolution = resolveLock(lock, index, cardLanguage ?? undefined);
    if (resolution.kind === "unknown") {
      toast.error(`${lock.label} is not in the catalog yet`);
      return;
    }
    if (!muted) {
      playLockTick();
    }
    if (resolution.kind === "picker") {
      setPickerQueue((queue) => [
        ...queue,
        { artKey: lock.artKey, label: lock.label, candidates: resolution.candidates },
      ]);
      return;
    }
    // Must run before the card leaves the guide.
    launchFlight();
    recordScanned(resolution.printing);
  }

  function handleFlightEnd(id: string) {
    setFlights((current) => current.filter((flight) => flight.id !== id));
  }

  function handleLockResolved(update: { artKey: string; key: string; label: string }) {
    // The engine settled a pending pick on its own; a second queued copy of
    // the same artwork still needs its own answer, hence find() not filter().
    if (!index) {
      return;
    }
    const entry = pickerQueue.find((queued) => queued.artKey === update.artKey);
    if (!entry) {
      return;
    }
    const resolution = resolveLock(
      { key: update.key, artKey: update.artKey, resolved: true },
      index,
      cardLanguage ?? undefined,
    );
    if (resolution.kind !== "auto") {
      return;
    }
    setPickerQueue((queue) => queue.filter((queued) => queued !== entry));
    toast.success(`Recognised ${legendDisplayName(resolution.printing.card)}`);
    recordScanned(resolution.printing);
  }

  // Destructured before any JSX: member access on the hook's return object
  // during render makes the React Compiler bail with a refs-during-render error.
  const {
    videoRef,
    overlayRef,
    active,
    cvReady,
    embedderReady,
    deviceTooSlow,
    engineProgress,
    error: scanError,
    readout,
    start,
    stop,
    capture,
    identifyNow,
    unidentified,
    dismissUnidentified,
  } = useCardScanner(loaded, settings, assets, {
    onLock: handleLock,
    onLockResolved: handleLockResolved,
  });

  const ready = loaded !== null && cvReady && embedderReady;

  let mode: ScannerMode = "single";
  if (deviceTooSlow || tapToScan) {
    mode = "capture";
  } else if (autoScan) {
    mode = "auto";
  }
  if (settings.mode !== mode) {
    setSettings((previous) => ({ ...previous, mode }));
  }
  if (settings.paused !== detailOpen) {
    setSettings((previous) => ({ ...previous, paused: detailOpen }));
  }

  function lockCandidate(candidate: IdentifyCandidate) {
    handleLock({
      key: candidate.key,
      artKey: candidate.artKey,
      label: candidate.label,
      resolved: false,
    });
  }

  const {
    open: identifyOpen,
    snapshot: identifySnapshot,
    pending: identifyPending,
    candidates: identifyCandidates,
    run: handleIdentifyNow,
    dismiss: handleIdentifyDismiss,
    pick: handleIdentifyPick,
    answerMissed: handleIdentifyMissed,
  } = useScanIdentify({
    loaded,
    identifyNow,
    unidentified,
    dismissUnidentified,
    onPick: lockCandidate,
  });

  const {
    showing: suggesting,
    label: suggestionLabel,
    hint: suggestionHint,
    add: handleSuggestionAdd,
    dismiss: handleSuggestionDismiss,
  } = useScanSuggestion({ active, blocked: identifyOpen, loaded, readout, onLock: handleLock });

  // readout.aim.key is a bank image id; byImageId resolves it only to check orientation.
  const ghostImageId = active && !suggesting ? (readout.aim?.key ?? null) : null;
  const ghostPrinting = ghostImageId ? index?.byImageId.get(ghostImageId)?.[0] : undefined;
  const ghostLandscape =
    ghostPrinting !== undefined && getOrientation(ghostPrinting.card.types) === "landscape";

  function handlePick(printing: Printing) {
    setPickerQueue((queue) => queue.slice(1));
    if (!muted) {
      playLockTick();
    }
    recordScanned(printing);
  }

  function handlePickerDismiss() {
    setPickerQueue((queue) => queue.slice(1));
  }

  function handleAddOne(row: ScanSessionRow) {
    recordScanned(row.printing);
  }

  function handleRemoveOne(row: ScanSessionRow) {
    useScanSessionStore.getState().remove(row.printing.id);
  }

  const { adding, failedCount, resetFailedCount, addAll, followUp, dismissFollowUp } =
    useScanAdd(collections);

  const {
    confirmCount: clearConfirmCount,
    request: handleClear,
    clearNow: handleClearNow,
    cancelConfirm: handleClearCancel,
  } = useScanClear(resetFailedCount);

  function handleAddAllToDestination() {
    if (destination) {
      void addAll(destination.id);
    }
  }

  function handlePickDestination(collectionId: string) {
    setDestinationId(collectionId);
    void addAll(collectionId);
  }

  const {
    row: swapRow,
    request: swapRequest,
    select: handleChangePrinting,
    pick: handleSwapPick,
    dismiss: handleSwapDismiss,
  } = useScanSwap(allPrintings);

  function handleStart() {
    void start();
  }
  function handleStop() {
    stop();
  }
  function handleCapture() {
    void capture();
  }

  const layout = useScanLayout();
  const immersive = layout !== "boxed";
  const fullscreen = immersive && active;
  const shutter = immersive && layout === "portrait";
  const coarsePointer = useCoarsePointer();
  const phoneHandoff = layout === "boxed" && !coarsePointer;
  const trayAnchorRef = useRef<HTMLDivElement>(null);

  // Matching rules live in index.css. Cleared on unmount too, so leaving the
  // page mid-scan cannot strand the document in the immersive state.
  useEffect(() => {
    if (!fullscreen) {
      return;
    }
    document.documentElement.dataset.scanImmersive = "";
    return () => {
      delete document.documentElement.dataset.scanImmersive;
    };
  }, [fullscreen]);

  const settingsProps = {
    languageItems,
    language: cardLanguage ?? ANY_LANGUAGE,
    onLanguageChange: (value: string) => setCardLanguage(value === ANY_LANGUAGE ? null : value),
    autoScan,
    onAutoScanChange: setAutoScan,
    muted,
    onMutedChange: setMuted,
    tapToScan,
    onTapToScanChange: setTapToScan,
    deviceTooSlow,
  };

  const tray = (
    <ScanSessionTray
      index={index}
      collections={collections}
      destination={destination}
      adding={adding}
      failedCount={failedCount}
      compact={immersive && layout === "portrait"}
      resumed={resumeNotice !== null}
      notice={
        resumeNotice !== null && (
          <ScanResumeCallout
            cards={resumeNotice.cards}
            when={resumeNotice.when}
            destinationName={destination?.name ?? "a collection"}
            adding={adding}
            onAddAll={handleAddAllToDestination}
            onDiscard={handleClear}
          />
        )
      }
      onAddOne={handleAddOne}
      onRemoveOne={handleRemoveOne}
      onChangePrinting={handleChangePrinting}
      onClear={handleClear}
      onAddAll={handlePickDestination}
      unidentified={unidentified}
      onIdentifyMissed={handleIdentifyMissed}
      onDismissMissed={dismissUnidentified}
    />
  );

  return (
    <CardDetailOverlayProvider onOpenChange={setDetailOpen}>
      {!immersive && <ScanTopBar settings={settingsProps} />}

      <ScanStage
        layout={layout}
        immersive={immersive}
        fullscreen={fullscreen}
        viewfinder={
          <ScanViewfinder
            videoRef={videoRef}
            overlayRef={overlayRef}
            active={active}
            immersive={immersive}
            ghostImageId={ghostImageId}
            ghostConfidence={ghostConfidence(readout.bestInliers, readout.lockProgress)}
            ghostLandscape={ghostLandscape}
            ready={ready}
            cameraAvailable={cameraAvailable}
            bankLoaded={loaded !== null}
            engineProgress={engineProgress}
            showPhoneHint={phoneHandoff}
            onStart={handleStart}
          />
        }
        chrome={<ScanChrome active={active} settings={settingsProps} onStop={handleStop} />}
        controls={
          <ScanControls
            hint={suggestionHint}
            suggestionLabel={suggestionLabel}
            onSuggestionAdd={handleSuggestionAdd}
            onSuggestionDismiss={handleSuggestionDismiss}
            active={active}
            immersive={immersive}
            shutter={shutter}
            ready={ready}
            cameraAvailable={cameraAvailable}
            bankLoaded={loaded !== null}
            engineProgress={engineProgress}
            captureMode={settings.mode === "capture"}
            onStart={handleStart}
            onStop={handleStop}
            onCapture={handleCapture}
            onIdentifyNow={handleIdentifyNow}
          />
        }
        notices={
          <ScanNotices
            unavailableMessage={unavailableMessage}
            scanError={scanError}
            cameraAvailable={cameraAvailable}
          />
        }
        tray={tray}
        trayAnchorRef={trayAnchorRef}
      />

      <ScanFlightLayer flights={flights} targetRef={trayAnchorRef} onFlightEnd={handleFlightEnd} />

      <ScanPrintingPicker
        request={pickerQueue[0] ?? null}
        onPick={handlePick}
        onDismiss={handlePickerDismiss}
      />
      <ScanPrintingPicker
        request={swapRequest}
        onPick={handleSwapPick}
        onDismiss={handleSwapDismiss}
        title="Switch to another printing"
        description={
          swapRow
            ? `Move one scanned ${legendDisplayName(swapRow.printing.card)} to another printing, finish or language of the same card.`
            : ""
        }
      />
      <ScanIdentifySheet
        open={identifyOpen}
        snapshot={identifySnapshot}
        pending={identifyPending}
        candidates={identifyCandidates}
        onPick={handleIdentifyPick}
        onDismiss={handleIdentifyDismiss}
      />
      <ScanClearDialog
        count={clearConfirmCount}
        onOpenChange={(open) => {
          if (!open) {
            handleClearCancel();
          }
        }}
        onClear={handleClearNow}
      />
      <TakeWishlistFollowUpDialog
        printing={followUp?.printing ?? null}
        entries={followUp?.entries ?? []}
        takenQuantity={followUp?.taken ?? 0}
        onOpenChange={(open) => {
          if (!open) {
            dismissFollowUp();
          }
        }}
      />
    </CardDetailOverlayProvider>
  );
}
