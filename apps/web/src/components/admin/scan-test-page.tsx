import { imageUrl } from "@openrift/shared";
import {
  CameraIcon,
  CameraOffIcon,
  CheckIcon,
  ImageIcon,
  LoaderIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AdminPageTopBar } from "@/components/admin/admin-page-top-bar";
import { PageDescription } from "@/components/layout/page-top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  LockedCard,
  ResourceProgress,
  ScannerReadout,
  ScannerSettings,
} from "@/hooks/use-card-scanner";
import { DEFAULT_SCANNER_SETTINGS, useCardScanner } from "@/hooks/use-card-scanner";
import type { LoadedScanBank } from "@/lib/scan-bank";
import { describeKey, loadScanBank } from "@/lib/scan-bank";

const MODES: { value: string; label: string }[] = [
  { value: "single", label: "Single card (guide rect, fastest)" },
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

function formatMb(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

interface LoadRowProps {
  label: string;
  done: boolean;
  /** Byte progress, for the resources that report it. */
  progress?: ResourceProgress;
}

function LoadRow({ label, done, progress }: LoadRowProps) {
  let detail: string | null = null;
  let percent: number | null = null;
  if (!done && progress) {
    if (progress.total > 0 && progress.loaded >= progress.total) {
      // Fully downloaded but not ready yet: wasm compilation or session setup.
      detail = "starting…";
      percent = 100;
    } else if (progress.total > 0) {
      detail = `${formatMb(progress.loaded)} / ${formatMb(progress.total)}`;
      percent = (100 * progress.loaded) / progress.total;
    } else if (progress.loaded > 0) {
      detail = formatMb(progress.loaded);
    }
  }
  return (
    <div className="w-64 max-w-full">
      <div className="flex items-center gap-2">
        {done ? (
          <CheckIcon className="size-4 shrink-0 text-green-500" />
        ) : (
          <LoaderIcon className="size-4 shrink-0 animate-spin" />
        )}
        <span className="text-foreground flex-1 text-left">{label}</span>
        {detail !== null && (
          <span className="text-muted-foreground text-sm tabular-nums">{detail}</span>
        )}
      </div>
      {percent !== null && <Progress value={percent} className="mt-1.5" />}
    </div>
  );
}

function LocksCard({ locks }: { locks: LockedCard[] }) {
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
                <img
                  src={imageUrl(lock.key, "120w")}
                  alt=""
                  className="h-14 w-10 rounded object-cover"
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
                <img
                  src={imageUrl(entry.key, "120w")}
                  alt=""
                  className="h-12 w-9 rounded object-cover"
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

export function ScanTestPage() {
  const [loaded, setLoaded] = useState<LoadedScanBank | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ScannerSettings>(DEFAULT_SCANNER_SETTINGS);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // A live feed needs a secure context. Over a plain LAN dev server there is no
  // camera API at all, and saying so beats an unexplained failure. Resolved in
  // an effect because the route is server-rendered: reading navigator during
  // render would make the server and an https client render different markup,
  // which is a hydration mismatch. Null means "not known yet".
  const [cameraAvailable, setCameraAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    setCameraAvailable(navigator.mediaDevices?.getUserMedia !== undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await loadScanBank();
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
  }, []);

  // Destructured before any JSX: member access on the hook's return object
  // during render makes the React Compiler bail with a refs-during-render
  // error. Same rule as the dnd-kit hooks.
  const {
    videoRef,
    overlayRef,
    active,
    cvReady,
    embedderReady,
    engineProgress,
    error: scanError,
    readout,
    stillPreview,
    start,
    stop,
    scanStill,
    clearHistory,
  } = useCardScanner(loaded, settings);

  const ready = loaded !== null && cvReady && embedderReady;

  function handleStart() {
    void start();
  }
  function handleStop() {
    stop();
  }
  function handleClear() {
    clearHistory();
  }
  function handlePickPhoto() {
    fileInputRef.current?.click();
  }
  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      void scanStill(file);
    }
    event.target.value = "";
  }

  return (
    <>
      <AdminPageTopBar title="Scan Test" />
      <div className="px-safe mx-auto w-full max-w-5xl px-4 pt-3 pb-12">
        <PageDescription>
          Point the camera at a card and hold steady. Each frame is detected, rectified, ranked
          against the whole catalogue by embedding and verified by features, entirely on-device. A
          card locks once several frames agree; the lock time is the number the phone is judged on.
        </PageDescription>

        {loadError && (
          <Card className="border-destructive mt-4">
            <CardContent className="pt-6">
              <p className="font-medium">{loadError}</p>
              <p className="text-muted-foreground mt-2">
                The bank, labels and encoder model are generated, not committed. Run{" "}
                <code className="bg-muted rounded px-1 py-0.5">
                  bun scripts/scan/export-index.ts
                </code>{" "}
                and reload.
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
              {!active && stillPreview && (
                <img
                  src={stillPreview}
                  alt="Captured frame with the detected card outlined"
                  className="absolute inset-0 h-full w-full object-contain"
                />
              )}
              {!active && !stillPreview && (
                <div className="text-muted-foreground absolute inset-0 grid place-items-center px-6 text-center">
                  {ready ? (
                    `Ready — ${loaded.bank.keys.length} cards, bank ${(loaded.bytes / 1024 / 1024).toFixed(1)} MB`
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <LoadRow label="Card bank" done={loaded !== null} />
                      <LoadRow label="OpenCV" done={cvReady} progress={engineProgress.opencv} />
                      <LoadRow
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
              {/* Disabled while live: a still frame would race the loop's
                  in-flight frame on the same session. */}
              <Button onClick={handlePickPhoto} variant="secondary" disabled={!ready || active}>
                <ImageIcon />
                Photo
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button onClick={handleClear} variant="ghost">
                <RotateCcwIcon />
                Clear
              </Button>
              {active && (
                <span className="text-muted-foreground ml-auto tabular-nums">
                  {readout.fps} fps · {readout.totalMs.toFixed(0)}ms (detect{" "}
                  {readout.detectMs.toFixed(0)}, embed {readout.embedMs.toFixed(0)}, verify{" "}
                  {readout.verifyMs.toFixed(0)}) · focus {readout.focus.toFixed(0)}
                </span>
              )}
            </div>

            {scanError && <p className="text-destructive">{scanError}</p>}
            {cameraAvailable === false && (
              <p className="text-muted-foreground">
                The live feed needs a secure context, so it is unavailable over a plain http:// dev
                server. Use <strong>Photo</strong> to shoot a single frame, or open the site over
                https (a tunnel, or Chrome&apos;s
                <code className="bg-muted mx-1 rounded px-1 py-0.5">
                  unsafely-treat-insecure-origin-as-secure
                </code>
                flag) for the live loop.
              </p>
            )}

            <LocksCard locks={readout.locks} />
          </div>

          <div className="flex flex-col gap-4">
            <LiveFrameCard readout={readout} loaded={loaded} active={active} />
            <EngineCard settings={settings} onChange={setSettings} />
          </div>
        </div>
      </div>
    </>
  );
}
