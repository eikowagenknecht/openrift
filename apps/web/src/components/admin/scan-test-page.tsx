import { getOrientation } from "@openrift/shared";
import type { Printing } from "@openrift/shared";
import { useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCards } from "@/hooks/use-cards";
import { getCardImageUrl } from "@/lib/images";
import type { OcrResult } from "@/lib/ocr-scanner";
import { ocrScan, terminateOcr } from "@/lib/ocr-scanner";
import type { PhashIndex, PhashResult } from "@/lib/phash-scanner";
import { buildPhashIndex, phashScan } from "@/lib/phash-scanner";

export function ScanTestPage() {
  const { allCards, isLoading: cardsLoading } = useCards();

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
  const [phashIndex, setPhashIndex] = useState<PhashIndex | null>(null);
  const [phashBuilding, setPhashBuilding] = useState(false);
  const [phashProgress, setPhashProgress] = useState({ done: 0, total: 0 });
  const [phashResult, setPhashResult] = useState<PhashResult | null>(null);
  const [phashRunning, setPhashRunning] = useState(false);

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

  function captureFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.drawImage(video, 0, 0);
    setCapturedImage(canvas.toDataURL("image/png"));
    setOcrResult(null);
    setPhashResult(null);
  }

  async function runOcr() {
    const canvas = canvasRef.current;
    if (!canvas || allCards.length === 0) {
      return;
    }

    setOcrRunning(true);
    try {
      const result = await ocrScan(canvas, allCards);
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
    if (allCards.length === 0) {
      return;
    }
    setPhashBuilding(true);
    setPhashProgress({ done: 0, total: allCards.length });
    try {
      const index = await buildPhashIndex(allCards, (done, total) => {
        setPhashProgress({ done, total });
      });
      setPhashIndex(index);
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
      const result = phashScan(canvas, phashIndex);
      setPhashResult(result);
    } finally {
      setPhashRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        Test camera-based card scanning with two approaches: OCR (text recognition) and perceptual
        image hashing (visual similarity). Capture a card image and compare results.
      </div>

      {cardsLoading ? (
        <p className="text-sm text-muted-foreground">Loading card database...</p>
      ) : (
        <p className="text-sm text-muted-foreground">{allCards.length} printings loaded.</p>
      )}

      {/* Camera section */}
      <Card>
        <CardHeader>
          <CardTitle>Camera</CardTitle>
          <CardDescription>
            Point your camera at a card, then capture a frame to test scanning.
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
              <video
                ref={videoRef}
                className="w-full rounded-md border bg-muted"
                playsInline
                muted
                style={{ display: cameraActive ? "block" : "none" }}
              />
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
                  <Button onClick={runOcr} disabled={ocrRunning || allCards.length === 0}>
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

          <TabsContent value="phash" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Perceptual Hash (dHash)</CardTitle>
                <CardDescription>
                  Computes a visual fingerprint of the captured image and compares it against
                  pre-computed hashes of all card artwork. Requires building an index first.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  <Button
                    onClick={buildIndex}
                    disabled={phashBuilding || allCards.length === 0}
                    variant={phashIndex ? "outline" : "default"}
                  >
                    {phashBuilding
                      ? "Building..."
                      : phashIndex
                        ? `Rebuild Index (${phashIndex.entries.length} hashes)`
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
                    <MatchResults
                      matches={phashResult.matches.map((m) => ({
                        printing: m.printing,
                        score: m.similarity,
                        detail: `distance ${m.distance}/64`,
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
                src={getCardImageUrl(
                  match.printing.images[0].url,
                  "thumbnail",
                  getOrientation(match.printing.card.type),
                )}
                alt={match.printing.card.name}
                className="h-16 w-auto rounded"
              />
            )}
            <div className="flex-1">
              <p className="text-sm font-medium">{match.printing.card.name}</p>
              <p className="text-xs text-muted-foreground">
                {match.printing.set} #{match.printing.collectorNumber} &middot;{" "}
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
