import { formatDayTime } from "@openrift/shared";
import { CameraIcon, CameraOffIcon, LoaderIcon, RotateCcwIcon } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { toast } from "sonner";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { CardArtThumb } from "@/components/cards/card-art-thumb";
import { PageDescription } from "@/components/layout/page-top-bar";
import { ScanLoadRow } from "@/components/scan/scan-load-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LockedCard, ScannerReadout, ScannerSettings } from "@/hooks/use-card-scanner";
import { DEFAULT_SCANNER_SETTINGS, useCardScanner } from "@/hooks/use-card-scanner";
import { useHydrated } from "@/hooks/use-hydrated";
import type { ScanServing } from "@/hooks/use-scan-serving";
import { useLatestScanBankRun, useRebuildScanBank, useScanServing } from "@/hooks/use-scan-serving";
import type { CameraInfo, CameraInfoEntry } from "@/lib/camera-info";
import type { LoadedScanBank } from "@/lib/scan-bank";
import { describeKey, isLandscapeKey, loadScanBank } from "@/lib/scan-bank";

const MODES: { value: string; label: string }[] = [
  { value: "single", label: "Single card, one lock per card (handheld)" },
  { value: "auto", label: "Single card, copies counted (phone on a stand)" },
  { value: "capture", label: "Single card, tap to scan (slow devices)" },
  { value: "pan", label: "Pan (binder pages, spread-out cards)" },
];

const PROCESSING_SIZES: { value: string; label: string }[] = [
  { value: "480", label: "480px (fastest)" },
  { value: "720", label: "720px" },
  { value: "848", label: "848px (clip parity, default)" },
  { value: "1080", label: "1080px (most detail)" },
];

const CANDIDATE_TRIES: { value: string; label: string }[] = [
  { value: "2", label: "2 (fastest)" },
  { value: "4", label: "4 (calibrated default)" },
];

function LocksCard({ locks, loaded }: { locks: LockedCard[]; loaded: LoadedScanBank | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Locked</CardTitle>
      </CardHeader>
      <CardContent>
        {locks.length === 0 ? (
          <p className="text-muted-foreground">
            Nothing locked yet. A card locks once four sharp frames agree on it.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {locks.map((lock) => (
              <li key={`${lock.key}-${lock.at}`} className="flex items-center gap-3">
                <CardArtThumb
                  imageId={lock.key}
                  variant="120w"
                  className="w-10"
                  landscape={loaded !== null && isLandscapeKey(loaded.labels, lock.key)}
                />
                <span className="flex-1">{lock.label}</span>
                <Badge variant="secondary" className="tabular-nums">
                  {lock.lockSeconds.toFixed(2)}s · {lock.framesToLock} frames · {lock.inliers}{" "}
                  inliers
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

interface LiveFrameCardProps {
  readout: ScannerReadout;
  loaded: LoadedScanBank | null;
  active: boolean;
}

function LiveFrameCard({ readout, loaded, active }: LiveFrameCardProps) {
  const idleStatus = active ? "No confident card in view." : "Camera is off.";
  const frameStatus = readout.refused
    ? "Refused: the margin over the rival was too small."
    : idleStatus;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Live frame</CardTitle>
      </CardHeader>
      <CardContent>
        {readout.winnerKey !== null && loaded !== null && (
          <p>
            <span className="font-medium">{describeKey(loaded.labels, readout.winnerKey)}</span>
            <span className="text-muted-foreground tabular-nums">
              {" "}
              · {readout.winnerInliers} vs {readout.rivalInliers} rival inliers
            </span>
          </p>
        )}
        {readout.winnerKey === null && <p className="text-muted-foreground">{frameStatus}</p>}
        {readout.ranked.length > 0 && loaded !== null && (
          <ul className="mt-3 flex flex-col gap-2">
            {readout.ranked.map((entry) => (
              <li key={entry.key} className="flex items-center gap-2">
                <CardArtThumb
                  imageId={entry.key}
                  variant="120w"
                  className="w-9"
                  landscape={isLandscapeKey(loaded.labels, entry.key)}
                />
                <span className={entry.key === readout.winnerKey ? "flex-1 font-medium" : "flex-1"}>
                  {describeKey(loaded.labels, entry.key)}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  {entry.distance.toFixed(3)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {readout.candidate && (
          <p className="text-muted-foreground mt-3 tabular-nums">
            quad: aspect {readout.candidate.aspect.toFixed(2)} · area{" "}
            {(readout.candidate.areaFraction * 100).toFixed(0)}%
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CameraInfoRows({ entries }: { entries: CameraInfoEntry[] }) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
      {entries.map(([key, value]) => (
        <Fragment key={key}>
          <dt className="text-muted-foreground">{key}</dt>
          <dd className="break-words tabular-nums">{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

/**
 * What the browser reported about the camera track the scanner opened.
 *
 * The scanner asks for `facingMode: environment` and accepts whatever comes
 * back, which on a multi-camera phone may be the ultra-wide rather than the
 * main lens. This is the panel that says which one it was, and whether the
 * device exposes a zoom knob at all, so lens choice can be measured before
 * anything automates it.
 *
 * @returns The diagnostics card.
 */
function CameraCard({ info, active }: { info: CameraInfo | null; active: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Camera</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {info === null ? (
          <p className="text-muted-foreground">
            Start the camera to see which lens the browser picked and what it can do.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <p className="font-medium break-words">{info.label ?? "Unnamed track"}</p>
              {!active && (
                <p className="text-muted-foreground">From the last session, camera is off.</p>
              )}
            </div>

            {info.settings.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="font-medium">Settings</p>
                <CameraInfoRows entries={info.settings} />
              </div>
            )}

            <div className="flex flex-col gap-2">
              <p className="font-medium">Capabilities</p>
              {!info.capabilitiesSupported && (
                <p className="text-muted-foreground">
                  This browser does not expose getCapabilities, so zoom and focus cannot be read or
                  controlled here.
                </p>
              )}
              {info.capabilitiesSupported && info.capabilities.length === 0 && (
                <p className="text-muted-foreground">The track reported no capabilities.</p>
              )}
              {info.capabilities.length > 0 && <CameraInfoRows entries={info.capabilities} />}
            </div>

            {info.devices.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="font-medium">Video inputs ({info.devices.length})</p>
                <ul className="flex flex-col gap-1">
                  {info.devices.map((device) => (
                    <li key={device.deviceId} className="break-words">
                      {device.label === "" ? (
                        <span className="text-muted-foreground">Unnamed</span>
                      ) : (
                        device.label
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

interface EngineCardProps {
  settings: ScannerSettings;
  onChange: (settings: ScannerSettings) => void;
}

function EngineCard({ settings, onChange }: EngineCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Engine</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-muted-foreground">
          Margin, lock run and the verification shortlist run at the defaults calibrated on the real
          clips. Processing size applies right away; mode and candidates per frame apply when the
          camera is next started.
        </p>

        <div className="flex flex-col gap-2">
          <Label htmlFor="scan-mode">Mode</Label>
          <Select
            items={MODES}
            value={settings.mode}
            onValueChange={(value) =>
              onChange({ ...settings, mode: value as ScannerSettings["mode"] })
            }
          >
            <SelectTrigger id="scan-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODES.map((mode) => (
                <SelectItem key={mode.value} value={mode.value}>
                  {mode.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="scan-resolution">Processing size</Label>
          <Select
            items={PROCESSING_SIZES}
            value={String(settings.processingSize)}
            onValueChange={(value) => onChange({ ...settings, processingSize: Number(value) })}
          >
            <SelectTrigger id="scan-resolution">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROCESSING_SIZES.map((size) => (
                <SelectItem key={size.value} value={size.value}>
                  {size.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="scan-tries">Candidates per frame</Label>
          <Select
            items={CANDIDATE_TRIES}
            value={String(settings.candidatesToTry)}
            onValueChange={(value) => onChange({ ...settings, candidatesToTry: Number(value) })}
          >
            <SelectTrigger id="scan-tries">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CANDIDATE_TRIES.map((tries) => (
                <SelectItem key={tries.value} value={tries.value}>
                  {tries.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

function ServingCard({ serving }: { serving: ScanServing }) {
  const rebuild = useRebuildScanBank();
  const latestRun = useLatestScanBankRun();
  const running = rebuild.isPending || latestRun.data?.status === "running";

  async function handleRebuild() {
    let started: Awaited<ReturnType<typeof rebuild.mutateAsync>>;
    try {
      started = await rebuild.mutateAsync();
    } catch {
      // Reported by the global mutation error toast (see reportMutationError).
      return;
    }
    if (started.status === "already_running") {
      toast.info("A rebuild is already running");
    } else {
      toast.success("Bank rebuild started");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Serving</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {serving.status === "loading" && (
          <p className="text-muted-foreground">Resolving the manifest…</p>
        )}
        {serving.status === "unavailable" && (
          <p className="text-muted-foreground">
            No server bank yet, so scanning is unavailable. Rebuild to publish the first generation
            (the encoder file must exist under media/scan first).
          </p>
        )}
        {serving.status === "ready" && (
          <p className="text-muted-foreground tabular-nums">
            Server bank <code className="bg-muted rounded px-1">{serving.assets.bankHash}</code> ·{" "}
            {serving.assets.entryCount} entries
            {serving.assets.builtAt ? ` · built ${formatDayTime(serving.assets.builtAt)}` : ""}
          </p>
        )}
        {latestRun.data?.status === "failed" && (
          <p className="text-destructive">Last rebuild failed: {latestRun.data.errorMessage}</p>
        )}
        <div>
          <Button onClick={handleRebuild} disabled={running} variant="secondary">
            {running ? <LoaderIcon className="animate-spin" /> : <RotateCcwIcon />}
            Rebuild bank
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ScanTestPage() {
  const [loaded, setLoaded] = useState<LoadedScanBank | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ScannerSettings>(DEFAULT_SCANNER_SETTINGS);
  // True once the user has picked a mode themselves; the slow-device
  // auto-switch below must never fight an explicit choice.
  const [modeChosen, setModeChosen] = useState(false);
  // A live feed needs a secure context. Over a plain LAN dev server there is no
  // camera API at all, and saying so beats an unexplained failure. Held back
  // until hydration because the route is server-rendered: reading navigator
  // during the SSR pass would make the server and an https client render
  // different markup. Null means "not known yet".
  const hydrated = useHydrated();
  const cameraAvailable = hydrated ? navigator.mediaDevices?.getUserMedia !== undefined : null;

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
          setLoadError(error instanceof Error ? error.message : "Could not load the scan bank");
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [bankUrl, labelsUrl]);

  // Destructured before any JSX: member access on the hook's return object
  // during render makes the React Compiler bail with a refs-during-render
  // error. Same rule as the dnd-kit hooks.
  const {
    videoRef,
    overlayRef,
    active,
    cvReady,
    embedderReady,
    embedMsPerImage,
    deviceTooSlow,
    engineProgress,
    error: scanError,
    readout,
    cameraInfo,
    start,
    stop,
    capture,
    clearHistory,
  } = useCardScanner(loaded, settings, assets);

  const ready = loaded !== null && cvReady && embedderReady;
  // Lock ~ 3 agreeing frames at ~2.5x the per-image encoder cost each; see
  // SLOW_DEVICE_EMBED_MS for the measurements behind the factor.
  const predictedLockSeconds = Math.ceil((embedMsPerImage * 7.5) / 1000);

  // Tap-to-scan IS the slow-device path: once the encoder self-bench says
  // live scanning would crawl, flip the default mode over instead of only
  // asking the user to. The measurement lands during engine init, before the
  // camera can start, and an explicit mode choice is never overridden.
  if (deviceTooSlow && !modeChosen && settings.mode === "single") {
    setSettings((previous) => ({ ...previous, mode: "capture" }));
  }

  function handleSettingsChange(next: ScannerSettings): void {
    if (next.mode !== settings.mode) {
      setModeChosen(true);
    }
    setSettings(next);
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
  function handleClear() {
    clearHistory();
  }

  return (
    <>
      <AdminPageTopBar title="Scan Test" />
      <div className="px-safe mx-auto w-full max-w-5xl px-4 pt-3 pb-12">
        <PageDescription>
          Point the camera at a card and hold steady. A card locks once several frames agree, and
          the lock time is the number the phone is judged on.
        </PageDescription>

        {deviceTooSlow && (
          <Card className="mt-4 border-amber-500">
            <CardContent className="pt-6">
              <p className="font-medium">This device is too slow for live scanning.</p>
              <p className="text-muted-foreground mt-2">
                Recognising a card live would take roughly {predictedLockSeconds} seconds instead of
                under one
                {settings.mode === "capture" ? (
                  <>
                    , so the mode is set to <strong>tap to scan</strong>: aim with the guide as
                    usual and each tap scans one frame.
                  </>
                ) : (
                  <>
                    . Switch the mode to <strong>tap to scan</strong>: aim with the guide as usual
                    and each tap scans one frame.
                  </>
                )}
              </p>
            </CardContent>
          </Card>
        )}

        {loadError && (
          <Card className="border-destructive mt-4">
            <CardContent className="pt-6">
              <p className="font-medium">{loadError}</p>
              <p className="text-muted-foreground mt-2">
                The manifest names a generation that is missing from{" "}
                <code className="bg-muted rounded px-1 py-0.5">media/scan</code>. Rebuild the bank
                to publish a fresh one, or copy the files from production.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex flex-col gap-3">
            <div className="bg-muted relative aspect-3/4 overflow-hidden rounded-lg sm:aspect-video">
              {/* oxlint-disable-next-line jsx-a11y/media-has-caption -- live camera preview, no audio track */}
              <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
              <canvas
                ref={overlayRef}
                className="pointer-events-none absolute inset-0 h-full w-full"
              />
              {!active && (
                <div className="text-muted-foreground absolute inset-0 grid place-items-center px-6 text-center">
                  {ready ? (
                    `Ready — ${loaded.bank.keys.length} cards, bank ${(loaded.bytes / 1024 / 1024).toFixed(1)} MB`
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <ScanLoadRow label="Card bank" done={loaded !== null} />
                      <ScanLoadRow label="OpenCV" done={cvReady} progress={engineProgress.opencv} />
                      <ScanLoadRow
                        label="Encoder model"
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
                <Button onClick={handleStop} variant="secondary">
                  <CameraOffIcon />
                  Stop
                </Button>
              ) : (
                <Button onClick={handleStart} disabled={!ready || cameraAvailable !== true}>
                  <CameraIcon />
                  Start camera
                </Button>
              )}
              {active && settings.mode === "capture" && (
                <Button onClick={handleCapture}>
                  <CameraIcon />
                  Scan frame
                </Button>
              )}
              <Button onClick={handleClear} variant="ghost">
                <RotateCcwIcon />
                Clear
              </Button>
              {active && (
                <span className="text-muted-foreground ml-auto tabular-nums">
                  {readout.fps} fps · {readout.totalMs.toFixed(0)}ms (detect{" "}
                  {readout.detectMs.toFixed(0)}, embed {readout.embedMs.toFixed(0)}, verify{" "}
                  {readout.verifyMs.toFixed(0)}) · focus {readout.focus.toFixed(0)} ·{" "}
                  {/* Placements against locks: the throughput number for a
                      stack session, where the failure mode is a card counted
                      once too few rather than a wrong card. */}
                  {readout.placements} placed
                  {readout.missedPlacements > 0 && ` (${readout.missedPlacements} uncounted)`}
                  {readout.settling && " · settling"}
                </span>
              )}
            </div>

            {scanError && <p className="text-destructive">{scanError}</p>}
            {cameraAvailable === false && (
              <p className="text-muted-foreground">
                The camera needs a secure context, so it is unavailable over a plain http:// dev
                server. Open the site over https (a tunnel, or Chrome&apos;s
                <code className="bg-muted mx-1 rounded px-1 py-0.5">
                  unsafely-treat-insecure-origin-as-secure
                </code>
                flag).
              </p>
            )}

            <LocksCard locks={readout.locks} loaded={loaded} />
          </div>

          <div className="flex flex-col gap-4">
            <LiveFrameCard readout={readout} loaded={loaded} active={active} />
            <CameraCard info={cameraInfo} active={active} />
            <EngineCard settings={settings} onChange={handleSettingsChange} />
            <ServingCard serving={serving} />
          </div>
        </div>
      </div>
    </>
  );
}
