import { DEFAULT_SESSION_OPTIONS } from "@openrift/shared/scan/session";
import type { RgbaImage } from "@openrift/shared/scan/types";
import { useEffect, useRef, useState } from "react";

import { cameraErrorMessage } from "@/features/scan/lib/camera-error";
import type { CameraInfo } from "@/features/scan/lib/camera-info";
import { readCameraInfo } from "@/features/scan/lib/camera-info";
import { createAimStreaks } from "@/features/scan/lib/scan-aim-streak";
import type { LoadedScanBank } from "@/features/scan/lib/scan-bank";
import { acquireScannerStream } from "@/features/scan/lib/scan-camera";
import type { PendingFrame } from "@/features/scan/lib/scan-catchup";
import { SLOW_DEVICE_EMBED_MS, measuredEmbedMsPerImage } from "@/features/scan/lib/scan-embedder";
import { grabRotatedFrame } from "@/features/scan/lib/scan-frame-grab";
import type { ScannerEvents } from "@/features/scan/lib/scan-locks";
import { createPlacementTally } from "@/features/scan/lib/scan-placement-counts";
import { createRelockGuard } from "@/features/scan/lib/scan-relock";
import { createRotationTracker } from "@/features/scan/lib/scan-rotation";
import type { ScannerSettings } from "@/features/scan/lib/scan-session";
import { lockRunForMode } from "@/features/scan/lib/scan-session";
import { errorText } from "@/lib/error-text";

import { useScanCatchUp } from "./use-scan-catchup";
import type { ScanEngineAssets } from "./use-scan-engine";
import { useScanEngine } from "./use-scan-engine";
import { useScanFrames } from "./use-scan-frames";
import { useScanOverlay } from "./use-scan-overlay";
import { useScanPlacements } from "./use-scan-placements";
import { useScanSessions } from "./use-scan-sessions";

export function useCardScanner(
  loaded: LoadedScanBank | null,
  settings: ScannerSettings,
  assets: ScanEngineAssets | null,
  events?: ScannerEvents,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const workCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runningRef = useRef(false);
  const startingRef = useRef(false);
  // Bumped by stop and unmount. A start that was awaiting the camera when the
  // bump happened must not bring the stream up for a page that moved on.
  const runGenerationRef = useRef(0);
  const frameInFlightRef = useRef<Promise<unknown> | null>(null);
  const frameIndexRef = useRef(0);
  const sessionStartRef = useRef(0);
  const settingsRef = useRef(settings);
  const eventsRef = useRef(events);
  const idleGateRef = useRef(DEFAULT_SESSION_OPTIONS.rotationFallbackDistance);
  const rotationRef = useRef(createRotationTracker());
  const aimStreaksRef = useRef(createAimStreaks());
  // A capture-mode tap in flight; further taps are ignored until it settles.
  const capturingRef = useRef(false);
  const tallyRef = useRef(createPlacementTally());
  // Fed on every processed frame in every mode, so switching to single mode
  // mid-session finds it already up to date.
  const relockRef = useRef(createRelockGuard());
  const settlingRef = useRef({ disturbed: false, at: 0 });
  // The frame the last placement settled on, held until that placement either
  // produces a lock or is written off as a miss.
  const pendingFrameRef = useRef<PendingFrame | null>(null);

  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Kept past stop() on purpose: it's a snapshot, safer to read once the
  // camera (and its battery drain) is off.
  const [cameraInfo, setCameraInfo] = useState<CameraInfo | null>(null);

  function takePendingFrame(): PendingFrame | null {
    const pending = pendingFrameRef.current;
    pendingFrameRef.current = null;
    return pending;
  }

  function grabFrame(video: HTMLVideoElement): RgbaImage | null {
    // Written long-hand: the React Compiler cannot lower `??=` and bails out of
    // the whole hook if it sees one.
    if (!workCanvasRef.current) {
      workCanvasRef.current = document.createElement("canvas");
    }
    return grabRotatedFrame(
      video,
      workCanvasRef.current,
      settingsRef.current.processingSize,
      rotationRef.current.turns(),
    );
  }

  // The engine's loaders live in their own hook; the refs it returns are
  // written only there, this hook only ever reads them.
  const { cvRef, embedderRef, workerRef, cvReady, embedderReady, embedMsPerImage, engineProgress } =
    useScanEngine(assets, setError);

  const sessions = useScanSessions({
    loaded,
    settingsRef,
    frameInFlightRef,
    setIdleGate: (distance: number) => {
      idleGateRef.current = distance;
    },
    cvRef,
    embedderRef,
    workerRef,
    embedMsPerImage,
  });

  const overlay = useScanOverlay({ videoRef, runGenerationRef });

  const catchUp = useScanCatchUp({
    loaded,
    videoRef,
    runningRef,
    runGenerationRef,
    sessionStartRef,
    eventsRef,
    relockRef,
    tallyRef,
    grabFrame,
    processFrame: sessions.processFrame,
  });

  const placements = useScanPlacements({
    videoRef,
    runGenerationRef,
    settingsRef,
    tallyRef,
    setSettling: (disturbed: boolean, at: number) => {
      settlingRef.current = { disturbed, at };
    },
    takePendingFrame,
    setPendingFrame: (pending: PendingFrame | null) => {
      pendingFrameRef.current = pending;
    },
    resetTally: () => {
      tallyRef.current = createPlacementTally();
    },
    grabFrame,
    rearm: sessions.rearm,
    onMiss: catchUp.enqueue,
  });

  const frames = useScanFrames({
    loaded,
    videoRef,
    runningRef,
    runGenerationRef,
    settingsRef,
    eventsRef,
    sessionStartRef,
    nextFrameIndex: () => frameIndexRef.current++,
    setFrameInFlight: (frame: Promise<unknown>) => {
      frameInFlightRef.current = frame;
    },
    capturingRef,
    setCapturing: (capturing: boolean) => {
      capturingRef.current = capturing;
    },
    relockRef,
    settlingRef,
    tallyRef,
    clearPendingFrame: () => {
      pendingFrameRef.current = null;
    },
    idleGateRef,
    rotationRef,
    aimStreaksRef,
    grabFrame,
    hasSession: sessions.ready,
    processFrame: sessions.processFrame,
    setOverlayTarget: overlay.setTarget,
    shouldCatchUp: catchUp.shouldRun,
    runCatchUp: catchUp.run,
    onError: setError,
  });

  // Written in an effect, not during render, so the React Compiler doesn't
  // bail out of the whole hook.
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Same treatment for the lock callbacks: consumers pass fresh closures per
  // render, and the loop must always call the latest without restarting.
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(
    () => () => {
      runGenerationRef.current++;
      runningRef.current = false;
      for (const track of streamRef.current?.getTracks() ?? []) {
        track.stop();
      }
      streamRef.current = null;
    },
    [],
  );

  async function start() {
    // The Start button stays enabled until the camera opens; without this a
    // double tap leaks the first call's stream.
    if (startingRef.current || runningRef.current) {
      return;
    }
    startingRef.current = true;
    const generation = runGenerationRef.current;
    setError(null);

    // A failed previous start can leave a stream behind (play() rejected after
    // the camera opened); release it before opening a new one.
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    streamRef.current = null;

    const engineReady = await sessions.prepare();
    catchUp.reset();
    pendingFrameRef.current = null;
    if (!engineReady) {
      setError("The engine is still loading, try again in a moment.");
      startingRef.current = false;
      return;
    }
    frameIndexRef.current = 0;
    sessionStartRef.current = performance.now();
    // A fresh camera track can come up in a different orientation, so the
    // adopted rotation starts over.
    rotationRef.current.reset();

    // The React Compiler bails out of the whole hook on a `finally` clause or
    // on conditionals/loops inside try/catch, so control flow stays outside.
    const capFrameRate = measuredEmbedMsPerImage() > SLOW_DEVICE_EMBED_MS;
    const acquired = await acquireScannerStream(capFrameRate);
    const stream = acquired.stream;
    if (stream === null) {
      setError(cameraErrorMessage(acquired.failure, "Could not open the camera"));
      startingRef.current = false;
      return;
    }

    if (generation !== runGenerationRef.current) {
      // Stop was pressed or the page unmounted while the permission prompt
      // was open; without this the camera light stays on with no way off.
      for (const track of stream.getTracks()) {
        track.stop();
      }
      startingRef.current = false;
      return;
    }
    streamRef.current = stream;

    const video = videoRef.current;
    let playFailure: string | null = null;
    if (video) {
      video.srcObject = stream;
      try {
        await video.play();
      } catch (playError) {
        playFailure = errorText(playError, "Could not start the camera preview");
      }
    }
    if (playFailure !== null) {
      setError(playFailure);
      for (const track of stream.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
      startingRef.current = false;
      return;
    }

    runningRef.current = true;
    setActive(true);
    console.log(
      `[scan] START mode ${settingsRef.current.mode} processingSize ${settingsRef.current.processingSize} candidatesToTry ${settingsRef.current.candidatesToTry}` +
        ` video ${video?.videoWidth ?? 0}x${video?.videoHeight ?? 0}`,
    );

    capturingRef.current = false;
    relockRef.current.reset();
    placements.begin(generation);
    overlay.begin(generation);

    // Puts the guide on screen before the first processed frame; in capture
    // mode, before the first tap.
    if (video && settingsRef.current.mode !== "pan") {
      const scale = Math.min(
        1,
        settingsRef.current.processingSize / Math.max(video.videoWidth, video.videoHeight),
      );
      overlay.setTarget({
        quad: null,
        guide: true,
        frameWidth: Math.round(video.videoWidth * scale),
        frameHeight: Math.round(video.videoHeight * scale),
        turns: 0,
        focus: 0,
        runLength: 0,
        lockRun: lockRunForMode(settingsRef.current.mode),
      });
    }
    if (settingsRef.current.mode === "capture") {
      // Camera on, guide drawn, pipeline idle: frames run one at a time when
      // capture() is tapped.
      startingRef.current = false;
      return;
    }

    frames.startLoop();
    startingRef.current = false;

    // Read last, so enumerateDevices never delays the first frame; it never
    // rejects, so needs no guard of its own.
    const info = await readCameraInfo(stream);
    if (generation === runGenerationRef.current) {
      setCameraInfo(info);
    }
  }

  function stop() {
    runGenerationRef.current++;
    runningRef.current = false;
    capturingRef.current = false;
    setActive(false);
    frames.resetAimHint();
    overlay.clear();
    for (const track of streamRef.current?.getTracks() ?? []) {
      track.stop();
    }
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  return {
    videoRef,
    overlayRef: overlay.overlayRef,
    cvReady,
    embedderReady,
    embedMsPerImage,
    deviceTooSlow: embedMsPerImage > SLOW_DEVICE_EMBED_MS,
    engineProgress,
    active,
    error,
    readout: frames.readout,
    cameraInfo,
    start,
    stop,
    capture: frames.capture,
    identifyNow: catchUp.identifyNow,
    clearHistory: frames.clearHistory,
    unidentified: catchUp.pending,
    dismissUnidentified: catchUp.dismiss,
  };
}
