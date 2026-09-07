import type { Printing } from "@openrift/shared";
import { getOrientation, legendDisplayName } from "@openrift/shared";
import {
  CameraIcon,
  CameraOffIcon,
  LayersIcon,
  ScanSearchIcon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { CardDetailOverlayProvider } from "@/components/cards/card-detail-opener";
import { TakeWishlistFollowUpDialog } from "@/components/collection/take-wishlist-followup-dialog";
import {
  PageTopBar,
  PageTopBarActions,
  PageTopBarIconButton,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { ScanAddAllDialog } from "@/components/scan/scan-add-all-dialog";
import type { ScanFlight } from "@/components/scan/scan-flight-layer";
import { ScanFlightLayer } from "@/components/scan/scan-flight-layer";
import { ScanGhostPreview } from "@/components/scan/scan-ghost-preview";
import type { IdentifyCandidate } from "@/components/scan/scan-identify-sheet";
import { ScanIdentifySheet } from "@/components/scan/scan-identify-sheet";
import type { PickerRequest } from "@/components/scan/scan-printing-picker";
import { ScanPrintingPicker } from "@/components/scan/scan-printing-picker";
import { ScanSessionTray } from "@/components/scan/scan-session-tray";
import { ScanStage } from "@/components/scan/scan-stage";
import { ScanStartPanel } from "@/components/scan/scan-start-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { WishEntryFlat } from "@/hooks/use-wish-entries";
import { useWishEntries } from "@/hooks/use-wish-entries";
import type { LoadedScanBank } from "@/lib/scan-bank";
import { describeKey, isLandscapeKey, loadScanBank } from "@/lib/scan-bank";
import { ghostConfidence } from "@/lib/scan-confidence";
import { playLockTick } from "@/lib/scan-feedback";
import { guideRectIn, snapshotVideoRect } from "@/lib/scan-flight";
import { buildScanPrintingIndex, resolveLock, sortForPicker } from "@/lib/scan-resolve";
import type { ScannerMode } from "@/lib/scan-session";
import { isTempCopyId } from "@/lib/temp-copy-id";
import { cn } from "@/lib/utils";
import { SCAN_IDENTIFY_ONLY, useScanPrefsStore } from "@/stores/scan-prefs-store";
import type { ScanSessionRow } from "@/stores/scan-session-store";
import { useScanSessionStore } from "@/stores/scan-session-store";

const AIM_SUGGEST_SECONDS = 3;

const RESUME_PROMPT_AFTER_MS = 24 * 60 * 60 * 1000;

function shouldPromptResume(lastScanAt: number | null): boolean {
  return lastScanAt === null || Date.now() - lastScanAt >= RESUME_PROMPT_AFTER_MS;
}

function describeLastScan(lastScanAt: number | null): string {
  if (lastScanAt === null) {
    return "an earlier session";
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

const ANY_LANGUAGE = "any";

export function ScanPage() {
  const { allPrintings } = useCards();
  const { data: collections } = useCollections();

  const muted = useScanPrefsStore((state) => state.muted);
  const setMuted = useScanPrefsStore((state) => state.setMuted);
  const storedTargetId = useScanPrefsStore((state) => state.targetCollectionId);
  const setStoredTargetId = useScanPrefsStore((state) => state.setTargetCollectionId);
  const cardLanguage = useScanPrefsStore((state) => state.cardLanguage);
  const setCardLanguage = useScanPrefsStore((state) => state.setCardLanguage);
  const autoScan = useScanPrefsStore((state) => state.autoScan);
  const setAutoScan = useScanPrefsStore((state) => state.setAutoScan);
  const languageLabels = useLanguageLabels();

  const identifyOnly = storedTargetId === SCAN_IDENTIFY_ONLY || storedTargetId === null;
  // storedTargetId may reference a deleted collection; fall back to the inbox.
  const target = identifyOnly
    ? undefined
    : (collections.find((collection) => collection.id === storedTargetId) ??
      collections.find((collection) => collection.isInbox) ??
      collections[0]);
  const targetId = target?.id ?? null;
  const targetItems = [
    { value: SCAN_IDENTIFY_ONLY, label: "Just identify" },
    ...collections.map((collection) => ({ value: collection.id, label: collection.name })),
  ];

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
    useScanSessionStore.getState().restore((printingId) => byId.get(printingId));
  }, [allPrintings]);

  const resumed = useScanSessionStore((state) => state.resumed);
  const resumeNotice =
    resumed !== null && shouldPromptResume(resumed.lastScanAt)
      ? { cards: resumed.cards, when: describeLastScan(resumed.lastScanAt) }
      : null;

  function handleStartFresh() {
    // Discards the log only; copies an old session added stay in the collection.
    useScanSessionStore.getState().reset();
  }

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

  async function addPrinting(printing: Printing) {
    if (identifyOnly) {
      useScanSessionStore.getState().recordIdentified(printing);
      return;
    }
    if (!targetId) {
      return;
    }
    const { tempId, result } = batchedAdd.add(printing.id, targetId);
    useScanSessionStore.getState().recordPending(printing, tempId);
    try {
      const real = await result;
      useScanSessionStore.getState().confirmAdd(printing.id, tempId, real.id);
    } catch {
      // The global mutation onError already toasted; drop the optimistic row.
      useScanSessionStore.getState().dropPending(printing.id, tempId);
    }
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
    // A picker lock doesn't reach the tray until answered, by which point the
    // card has left the guide and a snapshot would show the next one.
    launchFlight();
    void addPrinting(resolution.printing);
  }

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
    void addPrinting(resolution.printing);
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

  const mode: ScannerMode = deviceTooSlow ? "capture" : autoScan ? "auto" : "single";
  if (settings.mode !== mode) {
    setSettings((previous) => ({ ...previous, mode }));
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
    void addPrinting(printing);
  }

  function handlePickerDismiss() {
    setPickerQueue((queue) => queue.slice(1));
  }

  async function handleRemoveOne(row: ScanSessionRow) {
    const copyId = row.copyIds.findLast((id) => !isTempCopyId(id));
    if (!copyId) {
      // Identify-only reading: no copy behind it, so undo is a plain count decrement.
      if (row.identifiedCount > 0) {
        useScanSessionStore.getState().removeIdentified(row.printing.id);
        return;
      }
      toast.info("Still saving that card, try again in a moment");
      return;
    }
    useScanSessionStore.getState().removeCopy(row.printing.id, copyId);
    try {
      await disposeCopies.mutateAsync({ copyIds: [copyId] });
      toast.success(`Removed 1× ${legendDisplayName(row.printing.card)}`);
    } catch {
      // The global mutation onError already toasted; put the row back.
      useScanSessionStore.getState().recordConfirmed(row.printing, copyId);
    }
  }

  async function handleSwitchPrinting(row: ScanSessionRow, to: Printing) {
    const copyId = row.copyIds.findLast((id) => !isTempCopyId(id));
    if (!copyId) {
      // Identify-only: moves between printings entirely in the store.
      if (row.identifiedCount > 0) {
        useScanSessionStore.getState().removeIdentified(row.printing.id);
        void addPrinting(to);
        return;
      }
      toast.info("Still saving that card, try again in a moment");
      return;
    }
    useScanSessionStore.getState().removeCopy(row.printing.id, copyId);
    void addPrinting(to);
    try {
      await disposeCopies.mutateAsync({ copyIds: [copyId] });
    } catch {
      useScanSessionStore.getState().recordConfirmed(row.printing, copyId);
    }
  }

  function handleAddOne(row: ScanSessionRow) {
    void addPrinting(row.printing);
  }

  async function handleRemoveAll() {
    const rows = [...useScanSessionStore.getState().rows.values()];
    const copyIds = rows.flatMap((row) => row.copyIds.filter((id) => !isTempCopyId(id)));
    if (copyIds.length === 0) {
      useScanSessionStore.getState().reset();
      return;
    }
    // Built before the try: React Compiler can't lower a conditional inside one.
    const removedLabel = `${copyIds.length} scanned ${copyIds.length === 1 ? "card" : "cards"}`;
    try {
      await disposeCopies.mutateAsync({ copyIds });
      useScanSessionStore.getState().reset();
      toast.success(`Removed ${removedLabel}`);
    } catch {
      // Rows stay: they're the only handle left on copies still in the collection.
    }
  }

  const [addAllOpen, setAddAllOpen] = useState(false);
  const [wishFollowUps, setWishFollowUps] = useState<
    { printing: Printing; entries: WishEntryFlat[]; taken: number }[]
  >([]);
  const wish = useWishEntries(true);
  const sessionRows = useScanSessionStore((state) => state.rows);
  const identifiedCards = [...sessionRows.values()].reduce(
    (sum, row) => sum + row.identifiedCount,
    0,
  );

  async function handleAddAll(collectionId: string) {
    const rowsNow = [...useScanSessionStore.getState().rows.values()];
    const jobs: { printing: Printing; tempId: string; result: Promise<{ id: string }> }[] = [];
    for (const row of rowsNow) {
      for (let i = 0; i < row.identifiedCount; i++) {
        const { tempId, result } = batchedAdd.add(row.printing.id, collectionId);
        useScanSessionStore.getState().convertIdentifiedToPending(row.printing.id, tempId);
        jobs.push({ printing: row.printing, tempId, result });
      }
    }
    if (jobs.length === 0) {
      return;
    }
    const outcomes = await Promise.allSettled(jobs.map((job) => job.result));
    let failed = 0;
    const addedByPrinting = new Map<string, { printing: Printing; taken: number }>();
    for (const [i, outcome] of outcomes.entries()) {
      const job = jobs[i];
      if (outcome.status === "fulfilled") {
        useScanSessionStore.getState().confirmAdd(job.printing.id, job.tempId, outcome.value.id);
        const counted = addedByPrinting.get(job.printing.id);
        if (counted) {
          counted.taken += 1;
        } else {
          addedByPrinting.set(job.printing.id, { printing: job.printing, taken: 1 });
        }
      } else {
        failed += 1;
        useScanSessionStore.getState().revertConvertToPending(job.printing.id, job.tempId);
      }
    }
    const added = jobs.length - failed;
    const collectionName =
      collections.find((collection) => collection.id === collectionId)?.name ?? "your collection";
    if (added > 0) {
      toast.success(`Added ${added} ${added === 1 ? "card" : "cards"} to ${collectionName}`);
    }
    if (failed > 0) {
      toast.warning(
        `${failed} ${failed === 1 ? "card" : "cards"} could not be added and stayed in the list`,
      );
    }
    const followUps = [...addedByPrinting.values()]
      .map(({ printing, taken }) => ({
        printing,
        taken,
        entries: wish.entriesForPrinting(printing.cardId, printing.id),
      }))
      .filter((item) => item.entries.length > 0);
    if (followUps.length > 0) {
      setWishFollowUps(followUps);
    }
  }

  const [swapRow, setSwapRow] = useState<ScanSessionRow | null>(null);
  const swapRequest: PickerRequest | null = swapRow
    ? {
        artKey: "",
        label: legendDisplayName(swapRow.printing.card),
        candidates: sortForPicker(
          allPrintings.filter((printing) => printing.cardId === swapRow.printing.cardId),
        ),
      }
    : null;

  function handleSwapPick(printing: Printing) {
    const row = swapRow;
    setSwapRow(null);
    if (!row || printing.id === row.printing.id) {
      return;
    }
    void handleSwitchPrinting(row, printing);
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
  const immersive = layout !== "boxed" && active;
  const coarsePointer = useCoarsePointer();
  const phoneHandoff = layout === "boxed" && !coarsePointer;
  const trayAnchorRef = useRef<HTMLDivElement>(null);

  // Matching rules live in index.css. Cleared on unmount too, so leaving the
  // page mid-scan cannot strand the document in the immersive state.
  useEffect(() => {
    if (!immersive) {
      return;
    }
    document.documentElement.dataset.scanImmersive = "";
    return () => {
      delete document.documentElement.dataset.scanImmersive;
    };
  }, [immersive]);

  const overVideo = immersive
    ? "border-white/20 bg-black/60 text-white hover:bg-black/70 hover:text-white"
    : "";

  const notices = (
    <>
      {deviceTooSlow && (
        <Card className="border-warning mt-4">
          <CardContent className="pt-6">
            <p className="font-medium">This device is too slow for live scanning.</p>
            <p className="text-muted-foreground mt-2">
              Tap to scan instead: aim with the guide as usual, then tap <strong>Scan card</strong>{" "}
              for each card.
            </p>
          </CardContent>
        </Card>
      )}

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
      {shownHint && (
        <p
          key={shownHint.kind}
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm text-white"
        >
          {shownHint.message}
        </p>
      )}
      {suggestion !== null && suggestionLabel !== null && (
        <div className="absolute bottom-4 left-1/2 flex max-w-[90%] -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/70 py-1 pr-1 pl-3 text-sm text-white">
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
      {!active && (
        <ScanStartPanel
          ready={ready}
          cameraAvailable={cameraAvailable}
          bankLoaded={loaded !== null}
          cvReady={cvReady}
          embedderReady={embedderReady}
          engineProgress={engineProgress}
          showPhoneHint={phoneHandoff}
          onStart={handleStart}
        />
      )}
    </>
  );

  const targetSelect = (
    // items must carry the full flat list: BaseUI's Select.Value resolves
    // the trigger label from it, even though the list below renders grouped.
    <Select
      items={targetItems}
      value={identifyOnly ? SCAN_IDENTIFY_ONLY : (targetId ?? "")}
      onValueChange={(value) => {
        if (value) {
          setStoredTargetId(value);
        }
      }}
    >
      <SelectTrigger aria-label="Add scans to" className={cn("max-w-40 sm:max-w-56", overVideo)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={SCAN_IDENTIFY_ONLY}>Just identify</SelectItem>
        {collections.length > 0 && <SelectSeparator />}
        {collections.map((collection) => (
          <SelectItem key={collection.id} value={collection.id}>
            {collection.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const muteButton = (
    <Button
      size="icon"
      variant="ghost"
      className={overVideo}
      onClick={() => setMuted(!muted)}
      aria-label={muted ? "Unmute scan sounds" : "Mute scan sounds"}
    >
      {muted ? <VolumeXIcon className="size-4" /> : <Volume2Icon className="size-4" />}
    </Button>
  );

  const autoScanButton = !deviceTooSlow && (
    <Button
      size="icon"
      variant="ghost"
      aria-pressed={autoScan}
      className={cn(overVideo, autoScan && "text-primary")}
      onClick={() => setAutoScan(!autoScan)}
      aria-label={
        autoScan
          ? "Auto-scan is on: turn it off to count each card once"
          : "Auto-scan is off: turn it on to count copies dealt past the camera"
      }
    >
      <LayersIcon className="size-4" />
    </Button>
  );

  const chrome = (
    <>
      {targetSelect}
      <div className="ml-auto flex items-center gap-1">
        {autoScanButton}
        {muteButton}
      </div>
    </>
  );

  const controls = (
    <>
      {active && (
        <>
          {settings.mode === "capture" && (
            <Button onClick={handleCapture} className={cn(!immersive && "flex-1 sm:flex-none")}>
              <CameraIcon />
              Scan card
            </Button>
          )}
          <Button size="lg" className="h-11 px-6" onClick={() => void handleIdentifyNow()}>
            <ScanSearchIcon />
            Identify now
          </Button>
          <Button onClick={handleStop} variant="secondary" className={overVideo}>
            <CameraOffIcon />
            Stop
          </Button>
        </>
      )}
      <div className={cn("flex items-center gap-2", active && !immersive && "ml-auto")}>
        {!immersive && <span className="text-muted-foreground text-sm">Card language</span>}
        <Select
          items={languageItems}
          value={cardLanguage ?? ANY_LANGUAGE}
          onValueChange={(value) => {
            if (value) {
              setCardLanguage(value === ANY_LANGUAGE ? null : value);
            }
          }}
        >
          <SelectTrigger aria-label="Card language" className={overVideo}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {languageItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );

  const tray = (
    <>
      {resumeNotice !== null && (
        <div className="bg-muted/50 mb-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md px-3 py-2">
          <span className="text-sm">
            {resumeNotice.cards} {resumeNotice.cards === 1 ? "card" : "cards"} from{" "}
            {resumeNotice.when}.
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => useScanSessionStore.getState().dismissResumed()}
            >
              Keep going
            </Button>
            <Button size="sm" variant="ghost" onClick={handleStartFresh}>
              Start fresh
            </Button>
          </div>
        </div>
      )}
      <ScanSessionTray
        index={index}
        onSwitchFinish={(row, to) => void handleSwitchPrinting(row, to)}
        onAddOne={handleAddOne}
        onRemoveOne={(row) => void handleRemoveOne(row)}
        onChangePrinting={setSwapRow}
        onRemoveAll={() => void handleRemoveAll()}
        onAddAll={() => setAddAllOpen(true)}
        unidentified={unidentified}
        onIdentifyMissed={handleIdentifyMissed}
        onDismissMissed={dismissUnidentified}
      />
    </>
  );

  return (
    <CardDetailOverlayProvider onOpenChange={setDetailOpen}>
      {!immersive && (
        <PageTopBarSticky width="capped">
          <PageTopBar>
            <PageTopBarTitle>Scan cards</PageTopBarTitle>
            <PageTopBarActions>
              {targetSelect}
              {!deviceTooSlow && (
                <PageTopBarIconButton
                  aria-pressed={autoScan}
                  className={cn(autoScan && "text-primary")}
                  onClick={() => setAutoScan(!autoScan)}
                  aria-label={
                    autoScan
                      ? "Auto-scan is on: turn it off to count each card once"
                      : "Auto-scan is off: turn it on to count copies dealt past the camera"
                  }
                >
                  <LayersIcon className="size-4" />
                </PageTopBarIconButton>
              )}
              <PageTopBarIconButton
                onClick={() => setMuted(!muted)}
                aria-label={muted ? "Unmute scan sounds" : "Mute scan sounds"}
              >
                {muted ? <VolumeXIcon className="size-4" /> : <Volume2Icon className="size-4" />}
              </PageTopBarIconButton>
            </PageTopBarActions>
          </PageTopBar>
        </PageTopBarSticky>
      )}

      <ScanStage
        layout={layout}
        immersive={immersive}
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
            ? `Move one scanned ${legendDisplayName(swapRow.printing.card)} to a different printing of the same card.`
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
      <ScanAddAllDialog
        open={addAllOpen}
        onOpenChange={setAddAllOpen}
        collections={collections}
        count={identifiedCards}
        targetId={targetId ?? undefined}
        onConfirm={(collectionId) => void handleAddAll(collectionId)}
      />
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
