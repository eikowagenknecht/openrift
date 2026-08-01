import type { Printing } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import {
  CameraIcon,
  CameraOffIcon,
  ScanSearchIcon,
  Volume2Icon,
  VolumeXIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  PageTopBar,
  PageTopBarActions,
  PageTopBarBack,
  PageTopBarIconButton,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import type { IdentifyCandidate } from "@/components/scan/scan-identify-sheet";
import { ScanIdentifySheet } from "@/components/scan/scan-identify-sheet";
import { ScanLoadRow } from "@/components/scan/scan-load-row";
import type { PickerRequest } from "@/components/scan/scan-printing-picker";
import { ScanPrintingPicker } from "@/components/scan/scan-printing-picker";
import { ScanSessionTray } from "@/components/scan/scan-session-tray";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LockedCard, ScannerSettings } from "@/hooks/use-card-scanner";
import { DEFAULT_SCANNER_SETTINGS, useCardScanner } from "@/hooks/use-card-scanner";
import { useCards } from "@/hooks/use-cards";
import { useCollections } from "@/hooks/use-collections";
import { useBatchedAddCopies, useDisposeCopies } from "@/hooks/use-copies";
import { useLanguageLabels } from "@/hooks/use-enums";
import { useScanAssets } from "@/hooks/use-scan-serving";
import type { LoadedScanBank } from "@/lib/scan-bank";
import { describeKey, loadScanBank } from "@/lib/scan-bank";
import { playLockTick } from "@/lib/scan-feedback";
import { buildScanPrintingIndex, resolveLock, sortForPicker } from "@/lib/scan-resolve";
import { isTempCopyId } from "@/lib/temp-copy-id";
import { useScanPrefsStore } from "@/stores/scan-prefs-store";
import type { ScanSessionRow } from "@/stores/scan-session-store";
import { useScanSessionStore } from "@/stores/scan-session-store";

/**
 * The almost-there band of {@link ScannerReadout.bestInliers}: verification
 * ran but finished just under the 11-inlier accept floor, which on a phone
 * almost always means slight blur or glare — one steadier frame away.
 */
const HOLD_STEADY_MIN_INLIERS = 6;
const HOLD_STEADY_MAX_INLIERS = 10;

/**
 * How long one artwork must top the plausible ranking without a lock before
 * the "Is it X?" suggestion chip offers it. Long enough that a normal lock
 * (well under a second on a healthy aim) never sees the chip, short enough
 * that a stuck scan gets its escape hatch before frustration.
 */
const AIM_SUGGEST_SECONDS = 3;

/**
 * The scanning page: aim a card in the guide, and every confident lock is
 * added to the target collection immediately — the tray below logs the
 * session with undo and finish controls. Locks the engine will not settle
 * itself (foils, unsplittable variants) open a picker right away; dismissing
 * it discards that lock.
 *
 * @returns The /collections/scan page.
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
  const languageLabels = useLanguageLabels();

  // The stored target may have been deleted since the last session; fall back
  // to the inbox, which every account has.
  const target =
    collections.find((collection) => collection.id === storedTargetId) ??
    collections.find((collection) => collection.isInbox) ??
    collections[0];
  const targetId = target?.id ?? null;
  const targetItems = collections.map((collection) => ({
    value: collection.id,
    label: collection.name,
  }));

  // The catalog's printing languages, for the card-language preference. The
  // stored value is kept selectable even if no printing carries it (yet).
  const languageItems = [
    ...new Set([...allPrintings.map((printing) => printing.language), cardLanguage]),
  ]
    .toSorted()
    .map((code) => ({ value: code, label: languageLabels[code] ?? code }));

  // A scan session is one page visit: the tray is a log of what THIS sitting
  // added, so a leftover from an earlier visit must not linger.
  useEffect(() => {
    useScanSessionStore.getState().reset();
  }, []);

  const [loaded, setLoaded] = useState<LoadedScanBank | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ScannerSettings>(DEFAULT_SCANNER_SETTINGS);
  // See the admin harness: navigator is read in an effect so the server and
  // an https client cannot render different markup.
  const [cameraAvailable, setCameraAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    setCameraAvailable(navigator.mediaDevices?.getUserMedia !== undefined);
  }, []);

  const assets = useScanAssets();
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

  const index = loaded ? buildScanPrintingIndex(allPrintings, loaded) : null;

  const [pickerQueue, setPickerQueue] = useState<PickerRequest[]>([]);
  const batchedAdd = useBatchedAddCopies();
  const disposeCopies = useDisposeCopies();

  async function addPrinting(printing: Printing) {
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
    if (!index) {
      return;
    }
    const resolution = resolveLock(lock, index, cardLanguage);
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
    void addPrinting(resolution.printing);
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
      cardLanguage,
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
  } = useCardScanner(loaded, settings, assets, {
    onLock: handleLock,
    onLockResolved: handleLockResolved,
  });

  const ready = loaded !== null && cvReady && embedderReady;

  // Tap-to-scan IS the slow-device path (see the admin harness). This page
  // has no mode selector, so the auto-switch is the only mode change.
  useEffect(() => {
    if (deviceTooSlow) {
      setSettings((previous) =>
        previous.mode === "single" ? { ...previous, mode: "capture" } : previous,
      );
    }
  }, [deviceTooSlow]);

  // The manual identify sheet and the automatic "Is it X?" chip both funnel
  // into handleLock with an unresolved lock, so the language preference, the
  // finish default and the printing picker all apply exactly as for a real
  // lock.
  const [identifyCandidates, setIdentifyCandidates] = useState<IdentifyCandidate[] | null>(null);
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
    identifyCandidates === null
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

  function handleIdentifyNow() {
    if (!loaded) {
      return;
    }
    const seen = new Set<string>();
    const candidates: IdentifyCandidate[] = [];
    for (const entry of readout.ranked) {
      const artKey = loaded.artKeys.get(entry.key) ?? entry.key;
      if (seen.has(artKey)) {
        continue;
      }
      seen.add(artKey);
      candidates.push({ key: entry.key, artKey, label: describeKey(loaded.labels, entry.key) });
    }
    if (candidates.length === 0) {
      toast.info("Nothing recognisable in the frame yet, aim at a card first");
      return;
    }
    setIdentifyCandidates(candidates.slice(0, 4));
  }

  function handleIdentifyPick(candidate: IdentifyCandidate) {
    setIdentifyCandidates(null);
    handleLock({
      key: candidate.key,
      artKey: candidate.artKey,
      label: candidate.label,
      resolved: false,
    });
  }

  const holdSteady =
    active &&
    suggestion === null &&
    readout.winnerKey === null &&
    readout.bestInliers >= HOLD_STEADY_MIN_INLIERS &&
    readout.bestInliers <= HOLD_STEADY_MAX_INLIERS;

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

  return (
    <>
      <PageTopBarSticky maxWidth="4xl">
        <PageTopBar>
          <PageTopBarBack to="/collections" aria-label="Back to collections" />
          <PageTopBarTitle>Scan cards</PageTopBarTitle>
          <PageTopBarActions>
            <Select
              items={targetItems}
              value={targetId ?? ""}
              onValueChange={(value) => {
                if (value) {
                  setStoredTargetId(value);
                }
              }}
            >
              <SelectTrigger aria-label="Add scans to" className="max-w-40 sm:max-w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {targetItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <PageTopBarIconButton
              onClick={() => setMuted(!muted)}
              aria-label={muted ? "Unmute scan sounds" : "Mute scan sounds"}
            >
              {muted ? <VolumeXIcon className="size-4" /> : <Volume2Icon className="size-4" />}
            </PageTopBarIconButton>
          </PageTopBarActions>
        </PageTopBar>
      </PageTopBarSticky>

      <div className="px-safe mx-auto w-full max-w-4xl px-4 pt-3 pb-12">
        {deviceTooSlow && (
          <Card className="mt-4 border-amber-500">
            <CardContent className="pt-6">
              <p className="font-medium">This device is too slow for live scanning.</p>
              <p className="text-muted-foreground mt-2">
                Tap to scan instead: aim with the guide as usual, then tap{" "}
                <strong>Scan card</strong> for each card.
              </p>
            </CardContent>
          </Card>
        )}

        {loadError && (
          <Card className="border-destructive mt-4">
            <CardContent className="pt-6">
              <p className="font-medium">Scanning is not available right now.</p>
              <p className="text-muted-foreground mt-2">{loadError}</p>
            </CardContent>
          </Card>
        )}

        <div className="mt-4 flex flex-col gap-3">
          <div className="bg-muted relative aspect-3/4 overflow-hidden rounded-lg sm:aspect-video">
            {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- live camera preview, no audio track */}
            <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
            <canvas
              ref={overlayRef}
              className="pointer-events-none absolute inset-0 h-full w-full"
            />
            {holdSteady && (
              <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-sm text-white">
                Almost — hold steady
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
              <div className="text-muted-foreground absolute inset-0 grid place-items-center px-6 text-center">
                {ready ? (
                  "Ready — start the camera and aim a card at the frame."
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <ScanLoadRow label="Card index" done={loaded !== null} />
                    <ScanLoadRow label="OpenCV" done={cvReady} progress={engineProgress.opencv} />
                    <ScanLoadRow
                      label="Recognition model"
                      done={embedderReady}
                      progress={engineProgress.encoder}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {active ? (
              <>
                {settings.mode === "capture" && (
                  <Button onClick={handleCapture} className="flex-1 sm:flex-none">
                    <CameraIcon />
                    Scan card
                  </Button>
                )}
                <Button onClick={handleIdentifyNow} variant="secondary">
                  <ScanSearchIcon />
                  Identify now
                </Button>
                <Button onClick={handleStop} variant="secondary">
                  <CameraOffIcon />
                  Stop
                </Button>
              </>
            ) : (
              <Button onClick={handleStart} disabled={!ready || cameraAvailable !== true}>
                <CameraIcon />
                Start camera
              </Button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-muted-foreground text-sm">Card language</span>
              <Select
                items={languageItems}
                value={cardLanguage}
                onValueChange={(value) => {
                  if (value) {
                    setCardLanguage(value);
                  }
                }}
              >
                <SelectTrigger aria-label="Card language">
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
          </div>

          {scanError && <p className="text-destructive">{scanError}</p>}
          {cameraAvailable === false && (
            <p className="text-muted-foreground">
              The camera needs a secure connection, so scanning only works over https.
            </p>
          )}

          <div className="mt-2">
            <ScanSessionTray
              index={index}
              onSwitchFinish={handleSwitchPrinting}
              onAddOne={handleAddOne}
              onRemoveOne={handleRemoveOne}
              onChangePrinting={setSwapRow}
            />
          </div>
        </div>
      </div>

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
        candidates={identifyCandidates}
        onPick={handleIdentifyPick}
        onDismiss={() => setIdentifyCandidates(null)}
      />
    </>
  );
}
