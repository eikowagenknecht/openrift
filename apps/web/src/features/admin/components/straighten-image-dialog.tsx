import type { ImageOriginalOutput, ImageQuad } from "@openrift/shared/contracts/admin/card-images";
import { CropIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import {
  useEnsurePrintingImageOriginal,
  useSetPrintingImageQuad,
} from "@/features/admin/hooks/use-admin-image-mutations";
import { QUAD_CORNERS, useQuadHandles } from "@/features/admin/hooks/use-quad-handles";
import { detectQuadInOriginal } from "@/features/admin/lib/straighten-detect";
import { clampQuad, defaultQuad, imageToDisplayScale } from "@/features/admin/lib/straighten-quad";
import { useScanServing } from "@/features/scan/hooks/use-scan-serving";
import { loadOpenCv } from "@/features/scan/lib/scan-opencv";
import { cn } from "@/lib/utils";

type Scope = readonly (readonly unknown[])[];

const HANDLE_RADIUS = 11;
const STROKE_WIDTH = 2;

async function ensureOriginal(
  run: (imageId: string) => Promise<ImageOriginalOutput>,
  imageId: string,
): Promise<{ original: ImageOriginalOutput | null; error: string | null }> {
  try {
    return { original: await run(imageId), error: null };
  } catch {
    return { original: null, error: "The original could not be prepared." };
  }
}

async function detectQuad(
  opencvUrl: string,
  url: string,
): Promise<{ quad: ImageQuad | null; error: string | null }> {
  try {
    return { quad: await detectQuadInOriginal(await loadOpenCv(opencvUrl), url), error: null };
  } catch {
    return { quad: null, error: "Card detection is unavailable. Place the corners by hand." };
  }
}

export function StraightenImageDialog({
  imageId,
  quad,
  invalidates,
}: {
  imageId: string;
  quad: ImageQuad | null;
  invalidates?: Scope;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        title={quad === null ? "Straighten" : "Straighten (corners set)"}
        onClick={() => setOpen(true)}
      >
        <CropIcon className={cn("size-3", quad !== null && "text-success")} />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          {open && (
            <StraightenDialogBody
              imageId={imageId}
              quad={quad}
              invalidates={invalidates}
              onDone={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function StraightenDialogBody({
  imageId,
  quad,
  invalidates,
  onDone,
}: {
  imageId: string;
  quad: ImageQuad | null;
  invalidates?: Scope;
  onDone: () => void;
}) {
  const opencvUrl = useScanServing().assets?.opencvUrl ?? null;
  const prepareOriginal = useEnsurePrintingImageOriginal();
  const setQuad = useSetPrintingImageQuad(invalidates);
  const prepare = prepareOriginal.mutateAsync;

  const [original, setOriginal] = useState<ImageOriginalOutput | null>(null);
  const [corners, setCorners] = useState<ImageQuad | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [displayWidth, setDisplayWidth] = useState(0);
  const imageRef = useRef<HTMLImageElement>(null);

  async function detect(source: ImageOriginalOutput): Promise<void> {
    if (opencvUrl === null) {
      setStatus("Card detection is unavailable. Place the corners by hand.");
      return;
    }
    setDetecting(true);
    setStatus("Looking for the card…");
    const result = await detectQuad(opencvUrl, source.url);
    setDetecting(false);
    if (result.error !== null) {
      setStatus(result.error);
      return;
    }
    if (result.quad === null) {
      setStatus("No card found. Drag the corners onto it.");
      return;
    }
    setStatus(null);
    setCorners(clampQuad(result.quad, source.width, source.height));
  }

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      setStatus("Preparing the original…");
      const result = await ensureOriginal(prepare, imageId);
      if (cancelled) {
        return;
      }
      if (result.original === null) {
        setStatus(result.error);
        return;
      }
      setStatus(null);
      setOriginal(result.original);
      if (quad !== null) {
        setCorners(clampQuad(quad, result.original.width, result.original.height));
        return;
      }
      setCorners(defaultQuad(result.original.width, result.original.height));
      await detect(result.original);
    }
    void load();
    return () => {
      cancelled = true;
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- runs once per opened image; the detector and the stored quad are read as they were on open
  }, [imageId]);

  useEffect(() => {
    const image = imageRef.current;
    if (image === null) {
      return;
    }
    const observer = new ResizeObserver(() => setDisplayWidth(image.getBoundingClientRect().width));
    observer.observe(image);
    setDisplayWidth(image.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, [original]);

  const width = original?.width ?? 1;
  const height = original?.height ?? 1;
  const scale = imageToDisplayScale(width, displayWidth);
  const { surfaceRef, draggingCorner, handleProps } = useQuadHandles({
    quad: corners ?? defaultQuad(width, height),
    width,
    height,
    onChange: setCorners,
  });

  return (
    <DialogForm
      onSubmit={() => {
        if (corners !== null) {
          setQuad.mutate({ imageId, quad: corners }, { onSuccess: onDone });
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>Straighten image</DialogTitle>
      </DialogHeader>
      <div className="flex justify-center">
        {original !== null && corners !== null && (
          <div className="relative inline-block">
            <img
              ref={imageRef}
              src={original.url}
              alt="Original scan"
              style={{ imageOrientation: "none" }}
              className="max-h-[60vh] w-auto rounded-md select-none"
            />
            <svg
              ref={surfaceRef}
              viewBox={`0 0 ${original.width} ${original.height}`}
              className="absolute inset-0 size-full touch-none"
            >
              <polygon
                points={corners.map((point) => `${point.x},${point.y}`).join(" ")}
                className="fill-primary/15 stroke-primary"
                strokeWidth={STROKE_WIDTH / scale}
              />
              {QUAD_CORNERS.map((corner) => (
                <circle
                  key={corner}
                  cx={corners[corner].x}
                  cy={corners[corner].y}
                  r={HANDLE_RADIUS / scale}
                  strokeWidth={STROKE_WIDTH / scale}
                  className={cn(
                    "stroke-background cursor-grab",
                    draggingCorner === corner ? "fill-primary" : "fill-primary/70",
                  )}
                  {...handleProps(corner)}
                />
              ))}
            </svg>
          </div>
        )}
      </div>
      {status !== null && <p className="text-muted-foreground text-sm">{status}</p>}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          className="sm:mr-auto"
          disabled={original === null || detecting}
          onClick={() => {
            if (original !== null) {
              void detect(original);
            }
          }}
        >
          Detect card
        </Button>
        {quad !== null && (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            disabled={setQuad.isPending}
            onClick={() => setQuad.mutate({ imageId, quad: null }, { onSuccess: onDone })}
          >
            Remove straightening
          </Button>
        )}
        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={corners === null || setQuad.isPending}>
          Save
        </Button>
      </DialogFooter>
    </DialogForm>
  );
}
