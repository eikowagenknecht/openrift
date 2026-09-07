import type { ShareImageAspect } from "@openrift/shared/share-image-params";
import { SHARE_IMAGE_CANVAS } from "@openrift/shared/share-image-params";
import {
  ImageDownIcon,
  Loader2Icon,
  RectangleHorizontalIcon,
  RectangleVerticalIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { downloadImageFromUrl } from "@/lib/share-image";

/**
 * Wide renders at 2x (1200x630 is an unfurl preview, not a deliverable);
 * vertical at 1x (1080x1920 is already the native upload size).
 */
function defaultScale(aspect: ShareImageAspect, scales: readonly number[]): number {
  if (aspect === "vertical") {
    return scales.includes(1) ? 1 : (scales[0] ?? 1);
  }
  return scales.includes(2) ? 2 : (scales[0] ?? 1);
}

export interface ShareImageRenderChoice {
  aspect: ShareImageAspect;
  scale: number;
  qr: boolean;
}

export interface ShareImagePanelProps {
  title: string;
  filenameBase: string;
  buildUrl: (choice: ShareImageRenderChoice) => string;
  download?: (choice: ShareImageRenderChoice, filename: string) => Promise<void>;
  aspects?: readonly ShareImageAspect[];
  scales?: readonly number[];
  qr: "available" | "requires-share" | "hidden";
  qrLabel?: string;
  note?: ReactNode;
}

/**
 * The app's one image-export surface: a live preview of the real server render
 * plus the shape / size / QR choices, ending in a Download button.
 *
 * The preview is the actual render at 1x, the same route the download hits.
 */
export function ShareImagePanel({
  title,
  filenameBase,
  buildUrl,
  download,
  aspects = ["landscape", "vertical"],
  scales = [1, 2],
  qr,
  qrLabel = "Include a QR code",
  note,
}: ShareImagePanelProps) {
  const [aspect, setAspect] = useState<ShareImageAspect>(aspects[0] ?? "landscape");
  const [scale, setScale] = useState(defaultScale(aspects[0] ?? "landscape", scales));
  const [qrOn, setQrOn] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);

  const canvas = SHARE_IMAGE_CANVAS[aspect];
  // A render without a share link carries no mark whatever the switch says.
  const withQr = qrOn && qr === "available";
  const showPreview = download === undefined;

  const previewUrl = buildUrl({ aspect, scale: 1, qr: withQr });

  const chooseAspect = (next: ShareImageAspect) => {
    setAspect(next);
    setScale(defaultScale(next, scales));
    setPreviewLoaded(false);
  };

  const handleDownload = async () => {
    const base = filenameBase.replaceAll(/[^\w -]+/gu, "_").trim() || "image";
    const filename = `${base}${aspect === "vertical" ? "-vertical" : ""}.png`;
    const choice: ShareImageRenderChoice = { aspect, scale, qr: withQr };
    const run =
      download === undefined
        ? downloadImageFromUrl(buildUrl(choice), filename)
        : download(choice, filename);
    setDownloading(true);
    try {
      await run;
      setDownloading(false);
    } catch {
      // Not a mutation, so it never reaches the global mutation error handler.
      // Flag reset here and above, not in `finally`: React Compiler can't lower it.
      setDownloading(false);
      toast.error("Couldn't prepare the image. Please try again.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {note}
      {showPreview ? (
        <div
          className="bg-muted/30 ring-border relative mx-auto w-full max-w-sm overflow-hidden rounded-md ring-1"
          style={{ aspectRatio: `${canvas.width} / ${canvas.height}` }}
        >
          <img
            // Keyed on the URL so an aspect/QR change remounts and re-shows the spinner.
            key={previewUrl}
            src={previewUrl}
            alt={`Preview of ${title}`}
            className="size-full object-contain"
            onLoad={() => setPreviewLoaded(true)}
          />
          {previewLoaded ? null : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2Icon className="text-muted-foreground size-5 animate-spin" />
            </div>
          )}
        </div>
      ) : null}

      {aspects.length > 1 ? (
        <div className="flex flex-col gap-2">
          <Label>Shape</Label>
          <ToggleGroup
            aria-label="Image shape"
            variant="outline"
            spacing={0}
            value={[aspect]}
            onValueChange={([next]) => {
              if (next === "landscape" || next === "vertical") {
                chooseAspect(next);
              }
            }}
          >
            <ToggleGroupItem value="landscape">
              <RectangleHorizontalIcon className="size-4" />
              Wide
            </ToggleGroupItem>
            <ToggleGroupItem value="vertical">
              <RectangleVerticalIcon className="size-4" />
              Tall
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      ) : null}

      {scales.length > 1 ? (
        <div className="flex flex-col gap-2">
          <Label>Size</Label>
          <ToggleGroup
            aria-label="Image size"
            variant="outline"
            spacing={0}
            value={[String(scale)]}
            onValueChange={([next]) => {
              const picked = Number(next);
              if (scales.includes(picked)) {
                setScale(picked);
              }
            }}
          >
            {scales.map((option) => (
              <ToggleGroupItem key={option} value={String(option)}>
                {option}×
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <p className="text-muted-foreground text-sm">
            {canvas.width * scale} × {canvas.height * scale} pixels
          </p>
        </div>
      ) : null}

      {qr === "hidden" ? null : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Switch
              id="share-image-qr"
              checked={withQr}
              disabled={qr !== "available"}
              onCheckedChange={setQrOn}
            />
            <Label htmlFor="share-image-qr" className="font-normal">
              {qrLabel}
            </Label>
          </div>
          {qr === "requires-share" ? (
            <p className="text-muted-foreground text-sm">
              Create a share link first and the QR code becomes available.
            </p>
          ) : null}
        </div>
      )}

      <Button className="self-start" onClick={() => void handleDownload()} disabled={downloading}>
        {downloading ? (
          <>
            <Loader2Icon className="size-4 animate-spin" />
            Preparing…
          </>
        ) : (
          <>
            <ImageDownIcon className="size-4" />
            Download image
          </>
        )}
      </Button>
    </div>
  );
}
