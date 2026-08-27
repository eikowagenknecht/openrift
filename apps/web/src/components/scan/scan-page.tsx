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
import { useScanLayout } from "@/hooks/use-scan-layout";
import { useScanServing } from "@/hooks/use-scan-serving";
import type { WishEntryFlat } from "@/hooks/use-wish-entries";
import { useWishEntries } from "@/hooks/use-wish-entries";
import type { AimHint } from "@/lib/scan-aim-hint";
import { createAimHintSmoother, deriveAimHint } from "@/lib/scan-aim-hint";
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

/**
 * How long one artwork must top the plausible ranking without a lock before
 * the "Is it X?" suggestion chip offers it. Long enough that a normal lock
 * (well under a second on a healthy aim) never sees the chip, short enough
 * that a stuck scan gets its escape hatch before frustration.
 */
const AIM_SUGGEST_SECONDS = 3;

/**
 * How old a restored session must be before the tray leads with a resume
 * banner. A reload mid-session should feel like nothing happened; a tray from
 * days ago should not silently pass as today's pulls.
 */
const RESUME_PROMPT_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * When the restored session last scanned, in banner words.
 *
 * @returns A phrase for the resume banner ("yesterday", "3 days ago").
 */
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

/** Card-language value for a stack that is not all one language. */
const ANY_LANGUAGE = "any";

/**
 * The scanning page: aim a card in the guide, and every confident lock is
 * added to the target collection immediately — the tray below logs the
 * session with undo and finish controls. Locks the engine will not settle
 * itself (foils, unsplittable variants) open a picker right away; dismissing
 * it discards that lock.
 *
 * @returns The /scan page.
 */
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

  // Recognise but do not collect. Null is a blob from before identify-only
  // became the default, so it belongs here too: whoever never picked a target
  // is exactly who the default is for.
  const identifyOnly = storedTargetId === SCAN_IDENTIFY_ONLY || storedTargetId === null;
  // A picked collection may have been deleted since the last session; fall back
  // to the inbox, which every account has, rather than silently stopping the
  // collecting the user asked for.
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

  // The catalog's printing languages, for the card-language preference. The
  // stored value is kept selectable even if no printing carries it (yet).
  const languageItems = [
    { value: ANY_LANGUAGE, label: "Any language" },
    ...[...new Set([...allPrintings.map((printing) => printing.language), cardLanguage ?? "EN"])]
      .toSorted()
      .map((code) => ({ value: code, label: languageLabels[code] ?? code })),
  ];

  // The session log survives leaving the page: anything persisted is rebuilt
  // from the catalog on arrival. A recent session resumes silently (a reload
  // mid-scan should feel like nothing happened); an old one leads with a
  // banner so yesterday's pulls cannot pass as today's.
  const [resumeNotice, setResumeNotice] = useState<{ cards: number; when: string } | null>(null);
  useEffect(() => {
    if (allPrintings.length === 0) {
      return;
    }
    const byId = new Map(allPrintings.map((printing) => [printing.id, printing]));
    const restored = useScanSessionStore.getState().restore((printingId) => byId.get(printingId));
    if (
      restored !== null &&
      (restored.lastScanAt === null || Date.now() - restored.lastScanAt >= RESUME_PROMPT_AFTER_MS)
    ) {
      setResumeNotice({ cards: restored.cards, when: describeLastScan(restored.lastScanAt) });
    }
  }, [allPrintings]);

  function handleStartFresh() {
    // Start fresh discards the log only: copies an old session added were
    // added on purpose and stay in the collection.
    useScanSessionStore.getState().reset();
    setResumeNotice(null);
  }

  const [loaded, setLoaded] = useState<LoadedScanBank | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ScannerSettings>(DEFAULT_SCANNER_SETTINGS);
  // See the admin harness: navigator is read in an effect so the server and
  // an https client cannot render different markup.
  const [cameraAvailable, setCameraAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    setCameraAvailable(navigator.mediaDevices?.getUserMedia !== undefined);
  }, []);

  const serving = useScanServing();
  const assets = serving.assets;
  // Primitive deps: the assets object is re-derived per render, and an
  // identity change mid-download would cancel the in-flight load.
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

  // Nothing published means nothing to download: the scanner has one source,
  // so there is no local export to fall back to. Keep the wording plain here;
  // the actionable version lives on the admin scan page.
  const unavailableMessage =
    serving.status === "unavailable"
      ? "The card index has not been published yet. Please try again later."
      : loadError;

  const index = loaded ? buildScanPrintingIndex(allPrintings, loaded) : null;

  const [pickerQueue, setPickerQueue] = useState<PickerRequest[]>([]);
  const batchedAdd = useBatchedAddCopies();
  const disposeCopies = useDisposeCopies();

  // Locked cards in flight to the tray, and the counter that keys them.
  const [flights, setFlights] = useState<ScanFlight[]>([]);
  const flightSeqRef = useRef(0);

  // A tray row's detail is up, over the whole page.
  const [detailOpen, setDetailOpen] = useState(false);

  async function addPrinting(printing: Printing) {
    if (identifyOnly) {
      // Named, logged, and that is the whole job — nothing reaches the account.
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
    // While the user reads a card's detail they are not aiming, and in collect
    // mode with auto-scan a card left in the guide would keep counting.
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
      // Each lock is one physical copy, so two foil pulls queue two picks.
      setPickerQueue((queue) => [
        ...queue,
        { artKey: lock.artKey, label: lock.label, candidates: resolution.candidates },
      ]);
      return;
    }
    // Only an auto-resolved lock flies: a picker lock does not reach the tray
    // until the user answers it, by which time the card has left the guide and
    // a snapshot would show the next one.
    launchFlight();
    void addPrinting(resolution.printing);
  }

  /**
   * Send a snapshot of whatever is in the guide right now flying into the
   * tray. Decoration only — a missing video, an unmeasurable box or a tainted
   * canvas all just mean no flight, never a failed add.
   *
   * @returns Nothing; the flight is queued as state.
   */
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
    // The engine kept looking after an unresolved lock and settled it — a
    // pending pick can be answered without the user. One entry per event: a
    // second queued copy of the same artwork still needs its own answer.
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
  // during render makes the React Compiler bail with a refs-during-render
  // error. Same rule as the dnd-kit hooks.
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

  // Aim coaching. The engine already knows why a scan is stalling — the card
  // is too small, the frame is soft, verification is a couple of inliers
  // short — and until now none of it reached the user. One line at a time,
  // smoothed so a single unlucky frame never flashes a message.
  const [aimHint, setAimHint] = useState<AimHint | null>(null);
  const aimHintSmootherRef = useRef(createAimHintSmoother());
  useEffect(() => {
    if (!active) {
      aimHintSmootherRef.current.reset();
      setAimHint(null);
      return;
    }
    const derived = deriveAimHint({
      active: true,
      hasCandidate: readout.candidate !== null,
      candidateAreaFraction: readout.candidateAreaFraction,
      bestInliers: readout.bestInliers,
      focus: readout.focus,
      topDistance: readout.ranked[0]?.distance,
      refused: readout.refused,
      isWinner: readout.winnerKey !== null,
      settling: readout.settling,
    });
    setAimHint(aimHintSmootherRef.current.update(derived, performance.now()));
  }, [active, readout]);

  // Tap-to-scan IS the slow-device path (see the admin harness) and outranks
  // the toggle; otherwise auto-scan is what decides whether a card that stays
  // in shot keeps counting. Both guide modes share one session plan, so this
  // can change mid-run without rebuilding anything.
  const mode: ScannerMode = deviceTooSlow ? "capture" : autoScan ? "auto" : "single";
  useEffect(() => {
    setSettings((previous) => (previous.mode === mode ? previous : { ...previous, mode }));
  }, [mode]);

  // The manual identify sheet and the automatic "Is it X?" chip both funnel
  // into handleLock with an unresolved lock, so the language preference, the
  // finish default and the printing picker all apply exactly as for a real
  // lock.
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
  useEffect(() => {
    // A dismissal holds only while the same artwork stays aimed at; once the
    // user aims at something else, the dismissed card may suggest again later.
    if (dismissalStale) {
      setDismissedSuggestion(null);
    }
  }, [dismissalStale]);

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
    // One tap adds one copy; the dismissal stops the chip from immediately
    // re-offering the card still sitting in the guide.
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

  /**
   * Identify (and, when the frame is convincing enough, add) whatever is in
   * the guide at the moment of the tap. This is also how a second copy of the
   * card still in hand is counted: the engine will not lock it twice on its
   * own, and the tap is the user saying there really are two.
   *
   * @returns Nothing; the sheet and the tray carry the result.
   */
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
      // Reported through onLock already, so the tray, the flight and the
      // printing picker have all had their turn.
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

  // Which unidentified card the open identify sheet is answering, if any: the
  // sheet is shared with the live "identify now" button, which answers no card.
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

  /**
   * Open the identify sheet for a card the scanner watched land but could not
   * name, offering the second look's own best guesses.
   *
   * @returns Nothing; the sheet opens as state.
   */
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

  // The "Is it X?" chip is an escape hatch for a scan that is not converging,
  // so it takes the spot; coaching is what plays while things are still going
  // well.
  const shownHint = suggestion === null ? aimHint : null;

  // The artwork the engine is closing in on, shown as a converging ghost so
  // the lock never arrives out of nowhere. Bank keys are image ids, so the aim
  // key addresses the art directly; the printing lookup is only needed to know
  // whether the art is a landscape battlefield.
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
    // User decision: dismissing the picker discards the lock — rescan the
    // card if it was wanted after all.
    setPickerQueue((queue) => queue.slice(1));
  }

  async function handleRemoveOne(row: ScanSessionRow) {
    const copyId = row.copyIds.findLast((id) => !isTempCopyId(id));
    if (!copyId) {
      // An identify-only reading has no copy behind it: the undo is a plain
      // count decrement, nothing to ask the API.
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
      // An identify-only reading moves between printings entirely in the
      // store — the finish switch is what corrects a foil pull's value.
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

  /**
   * Undo the session in one go: every copy it added leaves the collection and
   * the log starts over. What a test run needs, and the only alternative to
   * removing a long list of cards one at a time.
   *
   * @returns Nothing; the tray and the collection are updated.
   */
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
      // The global mutation onError already toasted. The rows stay, because
      // they are the only handle left on copies that are still in the
      // collection.
    }
  }

  // "Scan first, decide later": the dialog that commits an identify-only
  // session to a collection, and the wishlist follow-ups queued by a commit
  // (one dialog per wished card, answered in turn).
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

  /**
   * Commit every identify-only reading to the chosen collection. Each reading
   * becomes a batched optimistic add; a failed add puts the reading back so
   * nothing is silently lost.
   *
   * @returns Nothing; the tray rows convert in place.
   */
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
      // Partial-progress warning after a batched loop; the global mutation
      // toast already carries the server's error message.
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

  // The row whose printing is being swapped via the full printing picker.
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

  // On a phone the card in the guide is what needs the pixels, so once the
  // camera is running the page hands the whole viewport to the viewfinder and
  // floats its chrome over the picture. Before that the normal page layout
  // stays: the user keeps the header, the loading rows and the way back out.
  const layout = useScanLayout();
  const immersive = layout !== "boxed" && active;
  // A boxed layout on a coarse pointer is a tablet, whose rear camera is
  // already the good one. Only a mouse-driven desktop gets the phone offer.
  const coarsePointer = useCoarsePointer();
  const phoneHandoff = layout === "boxed" && !coarsePointer;
  const trayAnchorRef = useRef<HTMLDivElement>(null);

  // Hides the app header and stops the page scrolling under the viewfinder;
  // the matching rules live in index.css. Cleared on unmount as well as when
  // the camera stops, so leaving the page mid-scan cannot strand the document
  // in the immersive state.
  useEffect(() => {
    if (!immersive) {
      return;
    }
    document.documentElement.dataset.scanImmersive = "";
    return () => {
      delete document.documentElement.dataset.scanImmersive;
    };
  }, [immersive]);

  // Secondary controls sit on top of a live camera image, which can be any
  // brightness in either theme — so they carry their own dark plate instead of
  // trusting the surface tokens.
  const overVideo = immersive
    ? "border-white/20 bg-black/60 text-white hover:bg-black/70 hover:text-white"
    : "";

  const notices = (
    <>
      {deviceTooSlow && (
        <Card className="mt-4 border-amber-500">
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
        // Immersive floats the target-collection row over the top of the
        // picture, so the ghost drops below it instead of under the mute
        // button.
        className={cn("absolute right-4", immersive ? "top-20" : "top-4")}
      />
      {shownHint && (
        <p
          // Keyed on the kind so a changed line animates in rather than
          // swapping text under the reader's eye.
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
    // The full items array still goes to the root: BaseUI resolves the
    // trigger's display label from it, however the list below is grouped.
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
        {/* Identifying is not one of the collections, so it leads the list and
            a rule separates it from them. */}
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

  // Hidden on a device slow enough to be tapping every shot: there is nothing
  // continuous there for the toggle to change.
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

  // Starting the camera is the pre-start panel's own call to action, so this
  // row carries nothing but the card language until the camera is running.
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
          {/* The one control a user reaches for mid-scan without looking, and
              the way a second copy of the card in hand gets counted, so it is
              sized for a thumb. */}
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
            <Button size="sm" variant="outline" onClick={() => setResumeNotice(null)}>
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
        onSwitchFinish={handleSwitchPrinting}
        onAddOne={handleAddOne}
        onRemoveOne={handleRemoveOne}
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
    // Wraps the whole page so the tray inside the stage can open a card's
    // detail over it, rather than navigating away from a running session.
    <CardDetailOverlayProvider onOpenChange={setDetailOpen}>
      {!immersive && (
        <PageTopBarSticky maxWidth="4xl">
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
          // Answering or dismissing one follow-up surfaces the next wished
          // card from the same commit.
          if (!open) {
            setWishFollowUps((queue) => queue.slice(1));
          }
        }}
      />
    </CardDetailOverlayProvider>
  );
}
