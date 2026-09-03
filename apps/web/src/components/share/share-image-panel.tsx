import type { ShareImageAspect } from "@openrift/shared";
import { SHARE_IMAGE_CANVAS } from "@openrift/shared";
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
 * Default multiplier per aspect. Wide renders at 2× because 1200×630 is an
 * unfurl preview rather than a deliverable, while the vertical canvas is already
 * 1080×1920 — the native upload size for every vertical surface — so 1× there is
 * the finished image and anything more is editing headroom.
 * @returns The multiplier to preselect for an aspect.
 */
function defaultScale(aspect: ShareImageAspect, scales: readonly number[]): number {
  if (aspect === "vertical") {
    return scales.includes(1) ? 1 : (scales[0] ?? 1);
  }
  return scales.includes(2) ? 2 : (scales[0] ?? 1);
}

/** The render choices a creator makes in the panel. */
export interface ShareImageRenderChoice {
  aspect: ShareImageAspect;
  /** Multiplier over the base canvas; the URL builder maps it to its route's params. */
  scale: number;
  /** Whether the render should carry the scannable mark. */
  qr: boolean;
}

export interface ShareImagePanelProps {
  /** Human name of the thing being rendered, for the preview's alt text. */
  title: string;
  /** Base for the downloaded filename; sanitized here, "-vertical" appended for tall. */
  filenameBase: string;
  /**
   * Builds the render URL for a choice — both the live preview and the default
   * download hit it. Each surface's builder maps `scale` onto whatever its
   * route accepts (`size=hq` or `scale=N`).
   */
  buildUrl: (choice: ShareImageRenderChoice) => string;
  /**
   * Overrides the download for renders with no GET URL (the from-cards POST
   * used by browser-local decks). When set, the live preview is dropped too.
   */
  download?: (choice: ShareImageRenderChoice, filename: string) => Promise<void>;
  /** Canvas shapes offered. A single entry hides the Shape control. */
  aspects?: readonly ShareImageAspect[];
  /** Multipliers offered. A single entry hides the Size control. */
  scales?: readonly number[];
  /**
   * QR control state: `available` renders the switch live, `requires-share`
   * disables it with a hint to create a share link first, and `hidden` drops
   * the control (surfaces whose render can never carry a link).
   */
  qr: "available" | "requires-share" | "hidden";
  /** Label for the QR switch. */
  qrLabel?: string;
  /** Note above the controls, e.g. an unsaved-changes warning. */
  note?: ReactNode;
}

/**
 * The app's one image-export surface: a live preview of the real server render
 * plus the shape / size / QR choices, ending in a Download button. Every
 * share image (deck, list, collection, tier list, bundle) goes through this
 * panel so the controls and their behavior never drift between surfaces.
 *
 * The preview is the actual render at 1×, not a mock: it is the same route the
 * download hits, so what it shows is what gets saved, QR and crop included.
 * Only the multiplier differs, and that changes pixel count rather than layout.
 *
 * @returns The image-export panel node.
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
  // A render without a share link carries no mark whatever the switch says, so
  // the preview has to ask for the same thing the server will actually draw.
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
      // A download is not a mutation, so it never reaches the global mutation
      // error handler and has to say so itself. The flag is reset on both paths
      // rather than in a `finally`, which the React Compiler can't lower.
      setDownloading(false);
      toast.error("Couldn't prepare the image. Please try again.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {note}
      {showPreview ? (
        <div
          // The frame keeps the host dialog's height steady while a new render
          // arrives, so switching shape doesn't make the buttons jump.
          className="bg-muted/30 ring-border relative mx-auto w-full max-w-sm overflow-hidden rounded-md ring-1"
          style={{ aspectRatio: `${canvas.width} / ${canvas.height}` }}
        >
          <img
            // Keyed on the URL so a shape or QR change remounts the image and
            // the spinner comes back instead of the old render sitting there
            // looking current.
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
