import type { Printing } from "@openrift/shared";
import { useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCards } from "@/hooks/use-cards";
import { getCardImageUrl } from "@/lib/images";
import type { OcrResult } from "@/lib/ocr-scanner";
import { ocrScan, terminateOcr } from "@/lib/ocr-scanner";
import type { PhashConfig, PhashIndex, PhashResult } from "@/lib/phash-scanner";
import {
  DEFAULT_PHASH_CONFIG,
  buildPhashIndex,
  hashBitCount,
  phashScan,
} from "@/lib/phash-scanner";

export function ScanTestPage() {
  const { allPrintings } = useCards();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  // OCR state
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [ocrRunning, setOcrRunning] = useState(false);

  // pHash state
  const [phashConfig, setPhashConfig] = useState<PhashConfig>(DEFAULT_PHASH_CONFIG);
  const [phashIndex, setPhashIndex] = useState<PhashIndex | null>(null);
  const [phashBuilding, setPhashBuilding] = useState(false);
  const [phashProgress, setPhashProgress] = useState({ done: 0, total: 0 });
  const [phashResult, setPhashResult] = useState<PhashResult | null>(null);
  const [phashRunning, setPhashRunning] = useState(false);
  const [indexConfig, setIndexConfig] = useState<PhashConfig | null>(null);

  async function startCamera() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : "Failed to access camera");
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }

  function getGuideRect(videoW: number, videoH: number) {
    const cardAspect = 63 / 88;
    let guideH = videoH * 0.8;
    let guideW = guideH * cardAspect;
    if (guideW > videoW * 0.8) {
      guideW = videoW * 0.8;
      guideH = guideW / cardAspect;
    }
    const x = (videoW - guideW) / 2;
    const y = (videoH - guideH) / 2;
    return { x, y, w: guideW, h: guideH };
  }

  function captureFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      return;
    }

    const { x, y, w, h } = getGuideRect(video.videoWidth, video.videoHeight);
    canvas.width = Math.round(w);
    canvas.height = Math.round(h);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.drawImage(video, x, y, w, h, 0, 0, canvas.width, canvas.height);
    setCapturedImage(canvas.toDataURL("image/png"));
    setOcrResult(null);
    setPhashResult(null);
  }

  async function runOcr() {
    const canvas = canvasRef.current;
    if (!canvas || allPrintings.length === 0) {
      return;
    }

    setOcrRunning(true);
    try {
      const result = await ocrScan(canvas, allPrintings);
      setOcrResult(result);
    } catch (error) {
      setOcrResult({
        rawText: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        elapsed: 0,
        matches: [],
      });
    } finally {
      setOcrRunning(false);
    }
  }

  async function buildIndex() {
    if (allPrintings.length === 0) {
      return;
    }
    setPhashBuilding(true);
    setPhashProgress({ done: 0, total: allPrintings.length });
    try {
      const index = await buildPhashIndex(allPrintings, phashConfig, (done, total) => {
        setPhashProgress({ done, total });
      });
      setPhashIndex(index);
      setIndexConfig({ ...phashConfig });
    } finally {
      setPhashBuilding(false);
    }
  }

  function runPhash() {
    const canvas = canvasRef.current;
    if (!canvas || !phashIndex) {
      return;
    }

    setPhashRunning(true);
    try {
      const result = phashScan(canvas, phashIndex, phashConfig);
      setPhashResult(result);
    } finally {
      setPhashRunning(false);
    }
  }

  const configMatchesIndex =
    indexConfig !== null && JSON.stringify(indexConfig) === JSON.stringify(phashConfig);

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        Test camera-based card scanning with two approaches: OCR (text recognition) and perceptual
        image hashing (visual similarity). Capture a card image and compare results.
      </div>

      <p className="text-sm text-muted-foreground">{allPrintings.length} printings loaded.</p>

      {/* Camera section */}
      <Card>
        <CardHeader>
          <CardTitle>Camera</CardTitle>
          <CardDescription>
            Align a card within the guide overlay, then capture a frame to test scanning.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            {cameraActive ? (
              <>
                <Button onClick={captureFrame}>Capture Frame</Button>
                <Button variant="outline" onClick={stopCamera}>
                  Stop Camera
                </Button>
              </>
            ) : (
              <Button onClick={startCamera}>Start Camera</Button>
            )}
          </div>

          {cameraError && <p className="text-sm text-destructive">{cameraError}</p>}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Live Feed</p>
              <div className="relative overflow-hidden rounded-md">
                <video
                  ref={videoRef}
                  className="w-full rounded-md border bg-muted"
                  playsInline
                  muted
                  style={{ display: cameraActive ? "block" : "none" }}
                />
                {cameraActive && <CardGuideOverlay />}
              </div>
              {!cameraActive && (
                <div className="flex h-48 items-center justify-center rounded-md border bg-muted text-sm text-muted-foreground">
                  Camera off
                </div>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Captured Frame</p>
              {capturedImage ? (
                <img src={capturedImage} alt="Captured" className="w-full rounded-md border" />
              ) : (
                <div className="flex h-48 items-center justify-center rounded-md border bg-muted text-sm text-muted-foreground">
                  No capture yet
                </div>
              )}
              {/* Hidden canvas for capture processing */}
              <canvas ref={canvasRef} className="hidden" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Scanning approaches */}
      {capturedImage && (
        <Tabs defaultValue="ocr">
          <TabsList>
            <TabsTrigger value="ocr">OCR (Tesseract.js)</TabsTrigger>
            <TabsTrigger value="phash">Perceptual Hash</TabsTrigger>
          </TabsList>

          <TabsContent value="ocr" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Tesseract.js OCR</CardTitle>
                <CardDescription>
                  Extracts text from the captured image, then fuzzy-matches against card names,
                  public codes, and collector numbers.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Button onClick={runOcr} disabled={ocrRunning || allPrintings.length === 0}>
                    {ocrRunning ? "Scanning..." : "Run OCR Scan"}
                  </Button>
                  <Button variant="outline" onClick={() => void terminateOcr()}>
                    Reset OCR Worker
                  </Button>
                </div>

                {ocrResult && (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">
                        Raw OCR Text ({ocrResult.elapsed}ms)
                      </p>
                      <pre className="mt-1 max-h-40 overflow-auto rounded-md border bg-muted p-3 text-xs">
                        {ocrResult.rawText || "(no text detected)"}
                      </pre>
                    </div>
                    <MatchResults
                      matches={ocrResult.matches.map((m) => ({
                        printing: m.printing,
                        score: m.confidence,
                        detail: `${m.matchedOn} match`,
                      }))}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="phash" className="mt-4 space-y-4">
            {/* Parameter controls */}
            <Card>
              <CardHeader>
                <CardTitle>Parameters</CardTitle>
                <CardDescription>
                  Tweak hash settings and rebuild the index to experiment. Changes to algorithm,
                  grid size, crop, or blur require a re-index. Normalization is applied at scan time
                  too but the index stores raw hashes, so re-index after changes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                  <ParamSelect
                    label="Algorithm"
                    value={phashConfig.algorithm}
                    options={[
                      { value: "dhash-h", label: "dHash horizontal" },
                      { value: "dhash-v", label: "dHash vertical" },
                      { value: "ahash", label: "Average hash" },
                    ]}
                    onChange={(v) =>
                      setPhashConfig((c) => ({ ...c, algorithm: v as PhashConfig["algorithm"] }))
                    }
                  />
                  <ParamSelect
                    label="Normalization"
                    value={phashConfig.normalize}
                    options={[
                      { value: "minmax", label: "Min-max stretch" },
                      { value: "median", label: "Median stretch" },
                      { value: "none", label: "None" },
                    ]}
                    onChange={(v) =>
                      setPhashConfig((c) => ({ ...c, normalize: v as PhashConfig["normalize"] }))
                    }
                  />
                  <ParamSlider
                    label="Grid width"
                    value={phashConfig.hashW}
                    min={5}
                    max={128}
                    step={1}
                    onChange={(v) => setPhashConfig((c) => ({ ...c, hashW: v }))}
                  />
                  <ParamSlider
                    label="Grid height"
                    value={phashConfig.hashH}
                    min={5}
                    max={128}
                    step={1}
                    onChange={(v) => setPhashConfig((c) => ({ ...c, hashH: v }))}
                  />
                  <ParamSlider
                    label="Border crop %"
                    value={Math.round(phashConfig.borderInset * 100)}
                    min={0}
                    max={25}
                    step={1}
                    onChange={(v) => setPhashConfig((c) => ({ ...c, borderInset: v / 100 }))}
                  />
                  <ParamSlider
                    label="Blur radius"
                    value={phashConfig.blur}
                    min={0}
                    max={3}
                    step={1}
                    onChange={(v) => setPhashConfig((c) => ({ ...c, blur: v }))}
                  />
                </div>
                {!configMatchesIndex && phashIndex && (
                  <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
                    Parameters changed since last index build — rebuild to apply.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Actions & results */}
            <Card>
              <CardHeader>
                <CardTitle>Perceptual Hash Match</CardTitle>
                <CardDescription>
                  Build the index with current parameters, then run a match against the captured
                  frame.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <Button
                    onClick={buildIndex}
                    disabled={phashBuilding || allPrintings.length === 0}
                    variant={phashIndex && configMatchesIndex ? "outline" : "default"}
                  >
                    {phashBuilding
                      ? "Building..."
                      : phashIndex
                        ? `Rebuild Index (${phashIndex.entries.length})`
                        : "Build Hash Index"}
                  </Button>
                  <Button onClick={runPhash} disabled={phashRunning || !phashIndex}>
                    {phashRunning ? "Matching..." : "Run Hash Match"}
                  </Button>
                </div>

                {phashBuilding && (
                  <div className="space-y-1">
                    <Progress
                      value={
                        phashProgress.total > 0
                          ? (phashProgress.done / phashProgress.total) * 100
                          : 0
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Hashed {phashProgress.done} / {phashProgress.total} card images
                    </p>
                  </div>
                )}

                {phashResult && (
                  <div className="space-y-4">
                    <p className="text-xs text-muted-foreground">
                      Hash: <code className="font-mono">{phashResult.hashComputed}</code> | Matched
                      in {phashResult.elapsed}ms
                    </p>

                    {/* Debug pipeline visualization */}
                    {phashResult.debug && (
                      <div>
                        <p className="mb-2 text-xs font-medium text-muted-foreground">
                          Pipeline Debug
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <p className="mb-1 text-xs text-muted-foreground">
                              1. Cropped ({Math.round((1 - 2 * phashConfig.borderInset) * 100)}%)
                            </p>
                            <img
                              src={phashResult.debug.croppedDataUrl}
                              alt="Cropped"
                              className="w-full rounded border"
                            />
                          </div>
                          <div>
                            <p className="mb-1 text-xs text-muted-foreground">
                              2. Grid {phashResult.debug.gridW}&times;
                              {phashResult.debug.gridH} &rarr; {hashBitCount(phashConfig)} bits
                            </p>
                            <img
                              src={phashResult.debug.downsampledDataUrl}
                              alt="Downsampled grid"
                              className="w-full rounded border"
                              style={{ imageRendering: "pixelated" }}
                            />
                          </div>
                          <div>
                            <p className="mb-1 text-xs text-muted-foreground">3. Hash bits</p>
                            <HashBitsViz hash={phashResult.hashComputed} />
                          </div>
                        </div>
                      </div>
                    )}

                    <MatchResults
                      matches={phashResult.matches.map((m) => ({
                        printing: m.printing,
                        score: m.similarity,
                        detail: `distance ${m.distance}/${hashBitCount(phashConfig)}`,
                      }))}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

/**
 * Render hash hex as a small black/white grid of bits.
 * @returns The SVG grid element.
 */
function HashBitsViz({ hash }: { hash: string }) {
  let bits = "";
  for (const ch of hash) {
    bits += Number.parseInt(ch, 16).toString(2).padStart(4, "0");
  }
  const size = Math.ceil(Math.sqrt(bits.length));
  const cellSize = 4;
  const rows: string[][] = [];
  for (let r = 0; r < size; r++) {
    const row: string[] = [];
    for (let c = 0; c < size; c++) {
      const idx = r * size + c;
      row.push(idx < bits.length && bits[idx] === "1" ? "#fff" : "#000");
    }
    rows.push(row);
  }

  return (
    <svg
      viewBox={`0 0 ${size * cellSize} ${size * cellSize}`}
      className="w-full rounded border"
      style={{ imageRendering: "pixelated" }}
    >
      {rows.map((row, r) =>
        row.map((color, c) => (
          <rect
            key={`${r}-${c}`}
            x={c * cellSize}
            y={r * cellSize}
            width={cellSize}
            height={cellSize}
            fill={color}
          />
        )),
      )}
    </svg>
  );
}

function ParamSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-xs font-mono text-muted-foreground">{value}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : v)}
        aria-label={label}
      />
    </div>
  );
}

function ParamSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select
        value={value}
        onValueChange={(v) => {
          if (v !== null) {
            onChange(v);
          }
        }}
      >
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CardGuideOverlay() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md">
      <div
        className="rounded-lg border-2 border-dashed border-white"
        style={{
          height: "80%",
          aspectRatio: "63 / 88",
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)",
        }}
      />
    </div>
  );
}

function MatchResults({
  matches,
}: {
  matches: { printing: Printing; score: number; detail: string }[];
}) {
  if (matches.length === 0) {
    return <p className="text-sm text-muted-foreground">No matches found.</p>;
  }

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        Top Matches ({matches.length})
      </p>
      <div className="space-y-2">
        {matches.map((match, i) => (
          <div
            key={`${match.printing.id}-${i}`}
            className="flex items-center gap-3 rounded-md border p-3"
          >
            {match.printing.images[0] && (
              <img
                src={getCardImageUrl(match.printing.images[0].url, "thumbnail")}
                alt={match.printing.card.name}
                className="h-16 w-auto rounded"
              />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium">{match.printing.card.name}</p>
              <p className="text-xs text-muted-foreground">
                {match.printing.setSlug} #{match.printing.collectorNumber} &middot;{" "}
                {match.printing.rarity} &middot; {match.printing.publicCode}
              </p>
            </div>
            <div className="text-right">
              <Badge variant={match.score > 0.8 ? "default" : "secondary"}>
                {(match.score * 100).toFixed(1)}%
              </Badge>
              <p className="mt-1 text-xs text-muted-foreground">{match.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
