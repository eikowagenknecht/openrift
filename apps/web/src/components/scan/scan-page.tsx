import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import type { Printing } from "@openrift/shared";
import { getOrientation, legendDisplayName } from "@openrift/shared";
import {
  CameraIcon,
  CameraOffIcon,
  ScanSearchIcon,
  SlidersHorizontalIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { CardDetailOverlayProvider } from "@/components/cards/card-detail-opener";
import { TakeWishlistFollowUpDialog } from "@/components/collection/take-wishlist-followup-dialog";
import {
  PageTopBar,
  PageTopBarActions,
  PageTopBarButton,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import type { ScanFlight } from "@/components/scan/scan-flight-layer";
import { ScanFlightLayer } from "@/components/scan/scan-flight-layer";
import { ScanGhostPreview } from "@/components/scan/scan-ghost-preview";
import type { IdentifyCandidate } from "@/components/scan/scan-identify-sheet";
import { ScanIdentifySheet } from "@/components/scan/scan-identify-sheet";
import type { PickerRequest } from "@/components/scan/scan-printing-picker";
import { ScanPrintingPicker } from "@/components/scan/scan-printing-picker";
import { ScanSessionTray } from "@/components/scan/scan-session-tray";
import { ScanSettingsMenu } from "@/components/scan/scan-settings-menu";
import { ScanStage } from "@/components/scan/scan-stage";
import {
  ScanLoading,
  ScanStartHint,
  ScanStartPanel,
  ScanTips,
} from "@/components/scan/scan-start-panel";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card, CardContent } from "@/components/ui/card";
import type { LockedCard, ScannerSettings } from "@/hooks/use-card-scanner";
import { DEFAULT_SCANNER_SETTINGS, useCardScanner } from "@/hooks/use-card-scanner";
import { useCards } from "@/hooks/use-cards";
import { useCoarsePointer } from "@/hooks/use-coarse-pointer";
import { useCollections } from "@/hooks/use-collections";
import { useBatchedAddCopies, useDisposeCopies } from "@/hooks/use-copies";
import { useLanguageLabels } from "@/hooks/use-enums";
import { useHydrated } from "@/hooks/use-hydrated";
import { useScanLayout } from "@/hooks/use-scan-layout";
import { useScanServing } from "@/hooks/use-scan-serving";
import { useWishEntries } from "@/hooks/use-wish-entries";
import { randomUuid } from "@/lib/random-uuid";
import type { LoadedScanBank } from "@/lib/scan-bank";
import { describeKey, isLandscapeKey, loadScanBank } from "@/lib/scan-bank";
import { addInChunks, addJobsFor, reconcileJobs, settleAdd } from "@/lib/scan-commit";
import { ghostConfidence } from "@/lib/scan-confidence";
import { playLockTick } from "@/lib/scan-feedback";
import { guideRectIn, snapshotVideoRect } from "@/lib/scan-flight";
import { appendScanJournal } from "@/lib/scan-journal";
import { buildScanPrintingIndex, resolveLock, sortForPicker } from "@/lib/scan-resolve";
import type { ScannerMode } from "@/lib/scan-session";
import { cn } from "@/lib/utils";
import type { WishEntryFlat } from "@/lib/wish-entry";
import { useScanPrefsStore } from "@/stores/scan-prefs-store";
import type { ScanSessionRow } from "@/stores/scan-session-store";
import { useScanSessionStore } from "@/stores/scan-session-store";

const AIM_SUGGEST_SECONDS = 3;

const RESUME_PROMPT_AFTER_MS = 24 * 60 * 60 * 1000;

const CLEAR_CONFIRM_ABOVE = 10;

const OVER_VIDEO = "border-white/20 bg-black/60 text-white hover:bg-black/70 hover:text-white";

function shouldPromptResume(lastScanAt: number | null): boolean {
  return lastScanAt === null || Date.now() - lastScanAt >= RESUME_PROMPT_AFTER_MS;
}

function describeLastScan(lastScanAt: number | null): string {
  if (lastScanAt === null) {
    return "in an earlier session";
  }
  const days = Math.floor((Date.now() - lastScanAt) / (24 * 60 * 60 * 1000));
  if (days <= 0) {
    return "earlier today";
  }
  if (days === 1) {
    return "yesterday";
  }
  return `${days} days ago`;
}

function cardWord(count: number): string {
  return count === 1 ? "card" : "cards";
}

interface ShutterProps {
  icon: ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

function Shutter({ icon, label, disabled, onClick }: ShutterProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <Button
        size="icon"
        className="size-18 rounded-full [clip-path:none] [&_svg:not([class*='size-'])]:size-7"
        disabled={disabled}
        onClick={onClick}
        aria-label={label}
      >
        {icon}
      </Button>
      <span className="text-sm text-white/80">{label}</span>
    </div>
  );
}

function recordScanned(printing: Printing): void {
  useScanSessionStore.getState().add(printing);
  appendScanJournal({ type: "scan", printingId: printing.id });
}

const ANY_LANGUAGE = "any";

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

  // Include cardLanguage even if no printing currently has it, so it stays selectable.
  const languageItems = [
    { value: ANY_LANGUAGE, label: "Any language" },
    ...[...new Set([...allPrintings.map((printing) => printing.language), cardLanguage ?? "EN"])]
      .toSorted()
      .map((code) => ({ value: code, label: languageLabels[code] ?? code })),
  ];

  useEffect(() => {
    if (allPrintings.length === 0) {
      return;
    }
    const byId = new Map(allPrintings.map((printing) => [printing.id, printing]));
    const staged = useScanSessionStore.getState().restored !== null;
    useScanSessionStore.getState().restore((printingId) => byId.get(printingId));
    const after = useScanSessionStore.getState();
    let cards = 0;
    for (const row of after.rows.values()) {
      cards += row.count;
    }
    const pendingBatchId = after.pending?.batchId ?? null;
    appendScanJournal({ type: "open", rows: after.rows.size, cards, pending: pendingBatchId });
    if (staged) {
      appendScanJournal({
        type: "restore",
        cards: after.resumed?.cards ?? 0,
        pending: pendingBatchId,
      });
    }
  }, [allPrintings]);

  const resumed = useScanSessionStore((state) => state.resumed);
  const pendingAdd = useScanSessionStore((state) => state.pending);
  const resumeNotice =
    resumed !== null && shouldPromptResume(resumed.lastScanAt)
      ? { cards: resumed.cards, when: describeLastScan(resumed.lastScanAt) }
      : null;

  const [loaded, setLoaded] = useState<LoadedScanBank | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ScannerSettings>(DEFAULT_SCANNER_SETTINGS);
  // Null until hydration: reading navigator during SSR would mismatch server/client markup.
  const hydrated = useHydrated();
  const cameraAvailable = hydrated ? navigator.mediaDevices?.getUserMedia !== undefined : null;

  const serving = useScanServing();
  const assets = serving.assets;
  // assets is re-derived every render; depending on it directly would cancel the in-flight load.
  const bankUrl = assets?.bankUrl ?? null;
  const labelsUrl = assets?.labelsUrl ?? null;
  useEffect(() => {
    if (bankUrl === null || labelsUrl === null) {
      return;
    }
    let cancelled = false;
    async function load() {
      try {
        const result = await loadScanBank(bankUrl as string, labelsUrl as string);
        if (!cancelled) {
          setLoaded(result);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Could not load the scan data");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [bankUrl, labelsUrl]);

  // Actionable guidance for an unpublished bank lives on the admin scan page.
  const unavailableMessage =
    serving.status === "unavailable"
      ? "The card index has not been published yet. Please try again later."
      : loadError;

  const index = loaded ? buildScanPrintingIndex(allPrintings, loaded) : null;

  const [pickerQueue, setPickerQueue] = useState<PickerRequest[]>([]);
  const batchedAdd = useBatchedAddCopies();
  const disposeCopies = useDisposeCopies();

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

  const aimHint = active ? readout.aimHint : null;

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

  const [identify, setIdentify] = useState<{
    snapshot: string | null;
    pending: boolean;
    candidates: IdentifyCandidate[];
  } | null>(null);
  // Keyed so a sheet the user dismissed while it was still thinking cannot be
  // reopened by the answer arriving afterwards.
  const identifySeqRef = useRef(0);
  const [dismissedSuggestion, setDismissedSuggestion] = useState<string | null>(null);

  const aim = readout.aim;
  const dismissalStale =
    aim !== null && dismissedSuggestion !== null && aim.artKey !== dismissedSuggestion;
  if (dismissalStale) {
    setDismissedSuggestion(null);
  }

  const suggestion =
    active &&
    aim !== null &&
    aim.seconds >= AIM_SUGGEST_SECONDS &&
    readout.winnerKey === null &&
    aim.artKey !== dismissedSuggestion &&
    identify === null
      ? aim
      : null;
  const suggestionLabel = suggestion && loaded ? describeKey(loaded.labels, suggestion.key) : null;

  function handleSuggestionAdd() {
    if (!suggestion || !suggestionLabel) {
      return;
    }
    setDismissedSuggestion(suggestion.artKey);
    handleLock({
      key: suggestion.key,
      artKey: suggestion.artKey,
      label: suggestionLabel,
      resolved: false,
    });
  }

  function handleSuggestionDismiss() {
    if (suggestion) {
      setDismissedSuggestion(suggestion.artKey);
    }
  }

  // Also how a second copy of a card still in hand gets counted: the engine
  // won't lock the same artwork twice on its own.
  async function handleIdentifyNow() {
    if (!loaded) {
      return;
    }
    const seq = ++identifySeqRef.current;
    setIdentify({ snapshot: null, pending: true, candidates: [] });
    const attempt = await identifyNow((snapshot) => {
      if (identifySeqRef.current === seq) {
        setIdentify((current) => (current === null ? null : { ...current, snapshot }));
      }
    });
    if (identifySeqRef.current !== seq) {
      return;
    }
    if (attempt.identified) {
      // Reported through onLock already; nothing left for this sheet to do.
      setIdentify(null);
      return;
    }
    setIdentify({
      snapshot: attempt.snapshot,
      pending: false,
      candidates: attempt.candidates.map((candidate) => ({
        key: candidate.key,
        artKey: candidate.artKey,
        label: describeKey(loaded.labels, candidate.key),
        landscape: isLandscapeKey(loaded.labels, candidate.key),
      })),
    });
  }

  function handleIdentifyDismiss() {
    identifySeqRef.current += 1;
    setIdentify(null);
    setAnsweringId(null);
  }

  const [answeringId, setAnsweringId] = useState<string | null>(null);

  function handleIdentifyPick(candidate: IdentifyCandidate) {
    identifySeqRef.current += 1;
    setIdentify(null);
    if (answeringId !== null) {
      dismissUnidentified(answeringId);
      setAnsweringId(null);
    }
    handleLock({
      key: candidate.key,
      artKey: candidate.artKey,
      label: candidate.label,
      resolved: false,
    });
  }

  function handleIdentifyMissed(id: string) {
    const card = unidentified.find((entry) => entry.id === id);
    if (!card || !loaded) {
      return;
    }
    if (card.candidates.length === 0) {
      toast.info("Nothing recognisable in that frame, scan the card again");
      dismissUnidentified(id);
      return;
    }
    identifySeqRef.current += 1;
    setAnsweringId(id);
    setIdentify({
      snapshot: card.thumbnail,
      pending: false,
      candidates: card.candidates.map((candidate) => ({
        key: candidate.key,
        artKey: candidate.artKey,
        label: describeKey(loaded.labels, candidate.key),
        landscape: isLandscapeKey(loaded.labels, candidate.key),
      })),
    });
  }

  const shownHint = suggestion === null ? aimHint : null;

  // readout.aim.key is a bank image id; byImageId resolves it only to check orientation.
  const ghostImageId = active && suggestion === null ? (readout.aim?.key ?? null) : null;
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

  const [adding, setAdding] = useState(false);
  const [failedCount, setFailedCount] = useState(0);

  let shownFailedCount = failedCount;
  if (adding) {
    shownFailedCount = 0;
  } else if (failedCount === 0 && pendingAdd !== null) {
    shownFailedCount = pendingAdd.jobs.length;
  }

  const [clearConfirm, setClearConfirm] = useState<number | null>(null);

  function clearNow() {
    const cleared = useScanSessionStore.getState().clear();
    setFailedCount(0);
    const count = cleared.reduce((sum, row) => sum + row.count, 0);
    if (count === 0) {
      return;
    }
    appendScanJournal({ type: "clear", cards: count });
    toast.success(`Cleared ${count} ${cardWord(count)}`, {
      action: {
        label: "Undo",
        onClick: () => useScanSessionStore.getState().putBack(cleared),
      },
    });
  }
  function handleClear() {
    const rowsNow = [...useScanSessionStore.getState().rows.values()];
    const count = rowsNow.reduce((sum, row) => sum + row.count, 0);
    if (count > CLEAR_CONFIRM_ABOVE) {
      setClearConfirm(count);
      return;
    }
    clearNow();
  }

  const [wishFollowUps, setWishFollowUps] = useState<
    { printing: Printing; entries: WishEntryFlat[]; taken: number }[]
  >([]);
  const wish = useWishEntries(true);

  async function handleUndoAdd(batchId: string, copyIds: string[], rows: ScanSessionRow[]) {
    if (copyIds.length === 0) {
      return;
    }
    try {
      await disposeCopies.mutateAsync({ copyIds });
      appendScanJournal({ type: "undo-add", batchId, copies: copyIds.length });
      useScanSessionStore.getState().putBack(rows);
    } catch {
      // Reported by the global mutation error toast.
    }
  }

  async function handleAddAll(collectionId: string) {
    const store = useScanSessionStore.getState();
    const rowsNow = [...store.rows.values()];
    const reusable = store.pending?.collectionId === collectionId ? store.pending : null;
    const jobs = reusable ? reconcileJobs(reusable.jobs, rowsNow) : addJobsFor(rowsNow);
    if (jobs.length === 0) {
      return;
    }
    const batchId = reusable ? reusable.batchId : randomUuid();
    store.setPending({ batchId, collectionId, jobs });
    appendScanJournal({ type: "add-start", batchId, collectionId, jobs: jobs.length });
    setAdding(true);
    setFailedCount(0);
    const outcomes = await addInChunks(
      jobs,
      (job) => batchedAdd.add(job.printingId, collectionId, job.id, batchId).result,
    );
    setAdding(false);
    const { confirmed, copyIds, failed } = settleAdd(jobs, outcomes);
    appendScanJournal({ type: "add-settled", batchId, confirmed: copyIds.length, failed });
    useScanSessionStore.getState().take(confirmed);
    setFailedCount(failed);
    if (failed === 0) {
      useScanSessionStore.getState().clearPending();
    }
    if (confirmed.size > 0) {
      useScanSessionStore.getState().dismissResumed();
    }

    const confirmedRows = rowsNow
      .map((row) => ({ printing: row.printing, count: confirmed.get(row.printing.id) ?? 0 }))
      .filter((row) => row.count > 0);
    const added = jobs.length - failed;
    const collectionName =
      collections.find((collection) => collection.id === collectionId)?.name ?? "your collection";
    if (added > 0) {
      toast.success(`Added ${added} ${cardWord(added)} to ${collectionName}`, {
        action: {
          label: "Undo",
          onClick: () => void handleUndoAdd(batchId, copyIds, confirmedRows),
        },
      });
    }
    const followUps = confirmedRows
      .map((row) => ({
        printing: row.printing,
        taken: row.count,
        entries: wish.entriesForPrinting(row.printing.cardId, row.printing.id),
      }))
      .filter((item) => item.entries.length > 0);
    if (followUps.length > 0) {
      setWishFollowUps(followUps);
    }
  }

  function handleAddAllToDestination() {
    if (destination) {
      void handleAddAll(destination.id);
    }
  }

  function handlePickDestination(collectionId: string) {
    setDestinationId(collectionId);
    void handleAddAll(collectionId);
  }

  const [swapRow, setSwapRow] = useState<ScanSessionRow | null>(null);
  const swapRequest: PickerRequest | null = swapRow
    ? {
        artKey: "",
        label: legendDisplayName(swapRow.printing.card),
        candidates: sortForPicker(
          allPrintings.filter((printing) => printing.cardId === swapRow.printing.cardId),
        ),
        currentId: swapRow.printing.id,
      }
    : null;

  function handleSwapPick(printing: Printing) {
    const row = swapRow;
    setSwapRow(null);
    if (!row || printing.id === row.printing.id) {
      return;
    }
    useScanSessionStore.getState().move(row.printing.id, printing);
  }

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

  const notices = (
    <>
      {unavailableMessage && (
        <Card className="border-destructive mt-4">
          <CardContent className="pt-6">
            <p className="font-medium">Scanning is not available right now.</p>
            <p className="text-muted-foreground mt-2">{unavailableMessage}</p>
          </CardContent>
        </Card>
      )}

      {scanError && <p className="text-destructive mt-4">{scanError}</p>}

      {cameraAvailable === false && (
        <p className="text-muted-foreground mt-4">
          The camera needs a secure connection, so scanning only works over https.
        </p>
      )}
    </>
  );

  const viewfinder = (
    <>
      {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- live camera preview, no audio track */}
      <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
      <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
      <ScanGhostPreview
        imageId={ghostImageId}
        confidence={ghostConfidence(readout.bestInliers, readout.lockProgress)}
        landscape={ghostLandscape}
        className={cn("absolute right-4", immersive ? "top-20" : "top-4")}
      />
      {!active && (
        <ScanStartPanel
          ready={ready}
          cameraAvailable={cameraAvailable}
          bankLoaded={loaded !== null}
          engineProgress={engineProgress}
          showPhoneHint={phoneHandoff}
          immersive={immersive}
          onStart={handleStart}
        />
      )}
    </>
  );

  const chrome = (
    <>
      {active && (
        <Button
          variant="ghost"
          onClick={handleStop}
          className={cn("h-11 rounded-full px-4", OVER_VIDEO)}
        >
          <CameraOffIcon />
          Stop
        </Button>
      )}
      <div className="ml-auto">
        <ScanSettingsMenu
          {...settingsProps}
          trigger={
            <Button
              size="icon"
              variant="ghost"
              className={cn("size-11 rounded-full", OVER_VIDEO)}
              aria-label="Scan settings"
            />
          }
          triggerContent={<SlidersHorizontalIcon className="size-4" />}
        />
      </div>
    </>
  );

  const controls = (
    <>
      {shownHint && (
        <p key={shownHint.kind} className="rounded-full bg-black/60 px-3 py-1 text-sm text-white">
          {shownHint.message}
        </p>
      )}
      {suggestion !== null && suggestionLabel !== null && (
        <div className="flex max-w-[90%] items-center gap-1.5 rounded-full bg-black/70 py-1 pr-1 pl-3 text-sm text-white">
          <span className="truncate">Is it {suggestionLabel.split(" (")[0]}?</span>
          <Button size="sm" onClick={handleSuggestionAdd}>
            Add
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="text-white hover:bg-white/20 hover:text-white"
            onClick={handleSuggestionDismiss}
            aria-label="Dismiss suggestion"
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      )}
      {immersive && !active && (
        <div className="flex flex-col items-center gap-3 text-white">
          {ready ? (
            <ScanStartHint />
          ) : (
            <ScanLoading bankLoaded={loaded !== null} engineProgress={engineProgress} />
          )}
          <ScanTips className="max-w-64 justify-center text-white/70" />
        </div>
      )}
      {!active && shutter && (
        <Shutter
          icon={<CameraIcon />}
          label="Start camera"
          disabled={!ready || cameraAvailable !== true}
          onClick={handleStart}
        />
      )}
      {!active && immersive && !shutter && (
        <Button size="lg" disabled={!ready || cameraAvailable !== true} onClick={handleStart}>
          <CameraIcon />
          Start camera
        </Button>
      )}
      {active && shutter && (
        <Shutter
          icon={<ScanSearchIcon />}
          label={settings.mode === "capture" ? "Scan card" : "Identify now"}
          onClick={settings.mode === "capture" ? handleCapture : () => void handleIdentifyNow()}
        />
      )}
      {active && !shutter && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {settings.mode === "capture" ? (
            <Button size="lg" onClick={handleCapture}>
              <CameraIcon />
              Scan card
            </Button>
          ) : (
            <Button size="lg" onClick={() => void handleIdentifyNow()}>
              <ScanSearchIcon />
              Identify now
            </Button>
          )}
          <Button variant="ghost" onClick={handleStop} className={OVER_VIDEO}>
            <CameraOffIcon />
            Stop
          </Button>
        </div>
      )}
    </>
  );

  const tray = (
    <ScanSessionTray
      index={index}
      collections={collections}
      destination={destination}
      adding={adding}
      failedCount={shownFailedCount}
      compact={immersive && layout === "portrait"}
      resumed={resumeNotice !== null}
      notice={
        resumeNotice !== null && (
          <Callout className="border-warning mb-2 p-3">
            <div className="flex gap-2">
              <TriangleAlertIcon className="text-warning mt-0.5 size-4 shrink-0" />
              <div className="flex min-w-0 flex-col gap-2">
                <p>
                  These {resumeNotice.cards} {cardWord(resumeNotice.cards)} were scanned{" "}
                  {resumeNotice.when} and never added to a collection.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={adding}
                    onClick={handleAddAllToDestination}
                  >
                    Add them to {destination?.name ?? "a collection"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={handleClear}>
                    Discard
                  </Button>
                </div>
              </div>
            </div>
          </Callout>
        )
      }
      onAddOne={handleAddOne}
      onRemoveOne={handleRemoveOne}
      onChangePrinting={setSwapRow}
      onClear={handleClear}
      onAddAll={handlePickDestination}
      unidentified={unidentified}
      onIdentifyMissed={handleIdentifyMissed}
      onDismissMissed={dismissUnidentified}
    />
  );

  return (
    <CardDetailOverlayProvider onOpenChange={setDetailOpen}>
      {!immersive && (
        <PageTopBarSticky width="capped">
          <PageTopBar>
            <PageTopBarTitle>Scan cards</PageTopBarTitle>
            <PageTopBarActions>
              <ScanSettingsMenu
                {...settingsProps}
                trigger={<PageTopBarButton />}
                triggerContent={
                  <>
                    <SlidersHorizontalIcon className="size-4" />
                    Settings
                  </>
                }
              />
            </PageTopBarActions>
          </PageTopBar>
        </PageTopBarSticky>
      )}

      <ScanStage
        layout={layout}
        immersive={immersive}
        fullscreen={fullscreen}
        viewfinder={viewfinder}
        chrome={chrome}
        controls={controls}
        notices={notices}
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
        onDismiss={() => setSwapRow(null)}
        title="Switch to another printing"
        description={
          swapRow
            ? `Move one scanned ${legendDisplayName(swapRow.printing.card)} to another printing, finish or language of the same card.`
            : ""
        }
      />
      <ScanIdentifySheet
        open={identify !== null}
        snapshot={identify?.snapshot ?? null}
        pending={identify?.pending ?? false}
        candidates={identify?.candidates ?? []}
        onPick={handleIdentifyPick}
        onDismiss={handleIdentifyDismiss}
      />
      <AlertDialog
        open={clearConfirm !== null}
        onOpenChange={(open) => {
          if (!open) {
            setClearConfirm(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Clear {clearConfirm ?? 0} scanned {cardWord(clearConfirm ?? 0)}?
            </AlertDialogTitle>
            <AlertDialogDescription>They are not in a collection yet.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogPrimitive.Close
              render={<Button variant="destructive" />}
              onClick={clearNow}
            >
              Clear
            </AlertDialogPrimitive.Close>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <TakeWishlistFollowUpDialog
        printing={wishFollowUps[0]?.printing ?? null}
        entries={wishFollowUps[0]?.entries ?? []}
        takenQuantity={wishFollowUps[0]?.taken ?? 0}
        onOpenChange={(open) => {
          if (!open) {
            setWishFollowUps((queue) => queue.slice(1));
          }
        }}
      />
    </CardDetailOverlayProvider>
  );
}
