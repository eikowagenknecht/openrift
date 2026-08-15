import {
  ImageDownIcon,
  Loader2Icon,
  RectangleHorizontalIcon,
  RectangleVerticalIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ShareImageAspect } from "@/lib/share-image";
import { downloadImageFromUrl, tierListOwnerImageUrl } from "@/lib/share-image";
import { getSiteUrl } from "@/lib/site-config";

/**
 * Base canvas per aspect, mirroring `CANVAS` in the API's share-image core. Kept
 * here only to label the size buttons with the pixels they produce — a "2×" on
 * its own doesn't tell a creator whether the file will fit their thumbnail
 * template, and the whole point of the control is picking a resolution.
 */
const CANVAS: Record<ShareImageAspect, { width: number; height: number }> = {
  landscape: { width: 1200, height: 630 },
  vertical: { width: 1080, height: 1920 },
};

/** Multipliers the server accepts; 3 is the cap on this owner-only route. */
const SCALES = [1, 2, 3];

/**
 * Default multiplier per aspect. Wide renders at 2× because 1200×630 is an
 * unfurl preview rather than a deliverable, while the vertical canvas is already
 * 1080×1920 — the native upload size for every vertical surface — so 1× there is
 * the finished image and anything more is editing headroom.
 * @returns The multiplier to preselect for an aspect.
 */
function defaultScale(aspect: ShareImageAspect): number {
  return aspect === "vertical" ? 1 : 2;
}

interface TierListExportDialogProps {
  tierListId: string;
  title: string;
  /** A private list has no link to encode, so the QR is unavailable rather than off. */
  isShared: boolean;
  /** Set while the board has unsaved edits, which the render won't include. */
  dirty?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Picks what the exported board image looks like before downloading it. The
 * builder used to carry two fixed menu items (wide 2×, tall 1×), which meant the
 * QR and the resolution were decisions someone else had made — fine for a link
 * preview, wrong for a creator compositing the board into a thumbnail.
 *
 * The preview is the real render at 1×, not a mock: it is the same route the
 * download hits, so what it shows is what gets saved, QR and crop included. Only
 * the multiplier differs, and that changes pixel count rather than layout.
 *
 * @returns The export dialog node.
 */
export function TierListExportDialog({
  tierListId,
  title,
  isShared,
  dirty,
  open,
  onOpenChange,
}: TierListExportDialogProps) {
  const [aspect, setAspect] = useState<ShareImageAspect>("landscape");
  const [scale, setScale] = useState(defaultScale("landscape"));
  const [qr, setQr] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [previewLoaded, setPreviewLoaded] = useState(false);

  const canvas = CANVAS[aspect];
  // A private list renders without a mark whatever the switch says, so the
  // preview has to ask for the same thing the server will actually draw.
  const withQr = qr && isShared;

  const previewUrl = tierListOwnerImageUrl(getSiteUrl(), tierListId, { aspect, qr: withQr });

  const chooseAspect = (next: ShareImageAspect) => {
    setAspect(next);
    setScale(defaultScale(next));
    setPreviewLoaded(false);
  };

  const handleDownload = async () => {
    const base = title.replaceAll(/[^\w -]+/gu, "_").trim() || "tier-list";
    const fileName = `${base}${aspect === "vertical" ? "-vertical" : ""}.png`;
    const url = tierListOwnerImageUrl(getSiteUrl(), tierListId, { aspect, scale, qr: withQr });
    setDownloading(true);
    try {
      await downloadImageFromUrl(url, fileName);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export image</DialogTitle>
          <DialogDescription>
            Save the board as a PNG. Wide is the shape that shows when you paste a shared link; tall
            is sized for a story or a short video.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {dirty ? (
            <p className="text-muted-foreground text-sm">
              The image is drawn from the saved board, so save first to see your latest changes in
              it.
            </p>
          ) : null}
          <div
            // The frame keeps the dialog's height steady while a new render
            // arrives, so switching shape doesn't make the buttons jump.
            className="bg-muted/40 ring-border relative mx-auto w-full max-w-sm overflow-hidden rounded-md ring-1"
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

          <div className="flex flex-col gap-2">
            <Label>Size</Label>
            <ToggleGroup
              aria-label="Image size"
              variant="outline"
              spacing={0}
              value={[String(scale)]}
              onValueChange={([next]) => {
                const picked = Number(next);
                if (SCALES.includes(picked)) {
                  setScale(picked);
                }
              }}
            >
              {SCALES.map((option) => (
                <ToggleGroupItem key={option} value={String(option)}>
                  {option}×
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p className="text-muted-foreground text-sm">
              {canvas.width * scale} × {canvas.height * scale} pixels
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Switch
                id="tier-list-export-qr"
                checked={withQr}
                disabled={!isShared}
                onCheckedChange={setQr}
              />
              <Label htmlFor="tier-list-export-qr" className="font-normal">
                Include a QR code to the tier list
              </Label>
            </div>
            {isShared ? null : (
              <p className="text-muted-foreground text-sm">
                Create a share link first and the QR code becomes available.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => void handleDownload()} disabled={downloading}>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
