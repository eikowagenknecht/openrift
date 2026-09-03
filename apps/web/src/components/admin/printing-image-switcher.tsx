import type { AdminPrintingImageResponse, ProviderSettingResponse } from "@openrift/shared";
import { hostSlugFromUrl, imageUrl } from "@openrift/shared";
import {
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  ImagePlusIcon,
  PlusIcon,
  RotateCcwIcon,
  RotateCwIcon,
  ScissorsIcon,
  ScissorsLineDashedIcon,
  Trash2Icon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { useRef, useState } from "react";

import type { DeduplicatedSourceImage } from "@/components/admin/card-detail-shared";
import { sortByProviderOrder } from "@/components/admin/card-detail-shared";
import { ImagePreview } from "@/components/admin/image-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ImgWithFallback } from "@/components/ui/img-with-fallback";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import {
  useActivatePrintingImage,
  useAddFallbackArtUrl,
  useAddImageFromUrl,
  useDeletePrintingImage,
  useRehostPrintingImage,
  useRotatePrintingImage,
  useSetCandidatePrintingImage,
  useSetFallbackArt,
  useSetPrintingImageNeedsTrim,
  useUnrehostPrintingImage,
  useUploadFallbackArt,
  useUploadPrintingImage,
} from "@/hooks/use-admin-image-mutations";
import { cn } from "@/lib/utils";

type Rotation = 0 | 90 | 180 | 270;

/** Shared look for the substitute-art mode toggles (same metrics as the image tabs). */
const FALLBACK_TOGGLE_CLASS =
  "aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary aria-pressed:hover:text-primary-foreground bg-muted/50 text-muted-foreground h-6 min-w-0 rounded-md px-1.5 font-normal";

function getDisplayUrl(img: AdminPrintingImageResponse): string | null {
  if (!img.rehostedUrl) {
    return img.originalUrl;
  }
  // Cache-bust on rotation + needsTrim so admins see the regenerated result
  // immediately — the rehosted URL is stable but the file behind it is
  // rewritten in place when either changes.
  return `${img.rehostedUrl}-full.webp?r=${img.rotation}&t=${img.needsTrim ? 1 : 0}`;
}

function imageLabel(img: AdminPrintingImageResponse): string {
  return (img.originalUrl && hostSlugFromUrl(img.originalUrl)) ?? "upload";
}

/** One of the card's other printings' images, offered as substitute art. */
export interface SiblingImage {
  imageFileId: string;
  /** The owning printing's label, e.g. `OGN-202 · foil · EN`. */
  printingLabel: string;
}

export function PrintingImageSwitcher({
  printingId,
  printingLabel,
  images,
  sourceImages,
  siblingImages,
  derivedArtLabel,
  fallbackArtMode,
  fallbackImageFileId,
  providerSettings,
  invalidates,
  isAdmin,
}: {
  printingId: string;
  printingLabel: string;
  images: AdminPrintingImageResponse[];
  sourceImages: DeduplicatedSourceImage[];
  /** Images on the card's *other* printings, offered as substitute art to pin. */
  siblingImages: SiblingImage[];
  /**
   * Label of the printing the derived mode borrows art from, or null when the
   * card has no standard printing with art to derive from.
   */
  derivedArtLabel: string | null;
  fallbackArtMode: "auto" | "pinned" | "none";
  fallbackImageFileId: string | null;
  providerSettings: ProviderSettingResponse[];
  invalidates?: readonly (readonly unknown[])[];
  /** Card-review grant holders keep image finishing (activate/rehost/rotate/trim, set from candidate); un-rehost, delete, URL/file add stay full-admin. */
  isAdmin: boolean;
}) {
  const deletePrintingImage = useDeletePrintingImage(invalidates);
  const activatePrintingImage = useActivatePrintingImage(invalidates);
  const rehostPrintingImage = useRehostPrintingImage(invalidates);
  const unrehostPrintingImage = useUnrehostPrintingImage(invalidates);
  const rotatePrintingImage = useRotatePrintingImage(invalidates);
  const setNeedsTrim = useSetPrintingImageNeedsTrim(invalidates);
  const addImageFromUrl = useAddImageFromUrl(invalidates);
  const uploadPrintingImage = useUploadPrintingImage(invalidates);
  const setPrintingSourceImage = useSetCandidatePrintingImage(invalidates);
  const setFallbackArt = useSetFallbackArt(invalidates);
  const addFallbackArtUrl = useAddFallbackArtUrl(invalidates);
  const uploadFallbackArt = useUploadFallbackArt(invalidates);

  const orderSort = sortByProviderOrder(providerSettings);
  // The active image leads the strip and so is what the preview opens on —
  // provider order would otherwise front a rehosted-but-inactive image and
  // show something the site doesn't serve.
  const sortedImages = images.toSorted((a, b) => {
    if (a.isActive !== b.isActive) {
      return a.isActive ? -1 : 1;
    }
    return orderSort(imageLabel(a), imageLabel(b));
  });
  const sortedSourceImages = sourceImages.toSorted((a, b) => orderSort(a.source, b.source));

  const [selectedId, setSelectedId] = useState<string | null>(
    () => sortedImages[0]?.id ?? sortedSourceImages[0]?.candidatePrintingId ?? null,
  );
  const [resolution, setResolution] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const [showFallbackUrlInput, setShowFallbackUrlInput] = useState(false);
  const [fallbackUrlValue, setFallbackUrlValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fallbackFileInputRef = useRef<HTMLInputElement>(null);

  const selectedImage = images.find((img) => img.id === selectedId);
  const selectedSource = sourceImages.find((si) => si.candidatePrintingId === selectedId);

  const activeImage = images.find((img) => img.isActive);
  // Front specifically: substitute art fills the front slot, so a printing with
  // only an active back scan still needs one.
  const activeFrontImage = images.find((img) => img.isActive && img.face === "front");
  const pinnedSibling = siblingImages.find((s) => s.imageFileId === fallbackImageFileId);
  const effectiveImage = selectedImage ?? (selectedId ? null : activeImage);
  const effectiveSource = selectedSource;
  const effectiveUrl = effectiveImage
    ? getDisplayUrl(effectiveImage)
    : (effectiveSource?.url ?? null);

  return (
    <div className="w-full max-w-96 shrink-0 space-y-2">
      {/* Preview */}
      <ImagePreview
        url={effectiveUrl}
        alt={printingLabel}
        resolution={resolution}
        setResolution={setResolution}
        imgError={imgError}
        setImgError={setImgError}
      />
      {(effectiveImage || effectiveSource) && (
        <div className="flex min-h-5 items-center gap-2">
          {effectiveImage?.originalUrl && (
            <a
              href={effectiveImage.originalUrl}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground truncate"
              title={effectiveImage.originalUrl}
            >
              {new URL(effectiveImage.originalUrl).hostname}
            </a>
          )}
          {effectiveImage?.rehostedUrl && (
            <a
              href={`${effectiveImage.rehostedUrl}-full.webp?r=${effectiveImage.rotation}`}
              target="_blank"
              rel="noreferrer"
              className="text-success hover:text-success/80 ml-auto truncate"
              title={`${effectiveImage.rehostedUrl}-full.webp`}
            >
              rehosted
            </a>
          )}
          {effectiveSource && (
            <a
              href={effectiveSource.url}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground truncate"
              title={effectiveSource.url}
            >
              {new URL(effectiveSource.url).hostname}
            </a>
          )}
        </div>
      )}

      {/* Status + actions bar */}
      {effectiveImage && (
        <div className="flex min-h-6 items-center gap-1">
          {effectiveImage.isActive ? (
            <Badge variant="default">Active</Badge>
          ) : (
            <Badge variant="secondary">Inactive</Badge>
          )}
          {effectiveImage.rehostedUrl ? (
            <Badge variant="outline" className="text-success">
              Rehosted
            </Badge>
          ) : (
            <Badge variant="outline" className="text-warning">
              External
            </Badge>
          )}
          <span className="text-muted-foreground">{imageLabel(effectiveImage)}</span>
          <div className="ml-auto flex items-center gap-0.5">
            {effectiveImage.isActive ? (
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                title="Deactivate"
                disabled={activatePrintingImage.isPending}
                onClick={() =>
                  activatePrintingImage.mutate({ imageId: effectiveImage.id, active: false })
                }
              >
                <EyeIcon className="size-3" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                title="Set as active"
                disabled={activatePrintingImage.isPending}
                onClick={() =>
                  activatePrintingImage.mutate({ imageId: effectiveImage.id, active: true })
                }
              >
                <EyeOffIcon className="size-3" />
              </Button>
            )}
            {!effectiveImage.rehostedUrl && effectiveImage.originalUrl && (
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                title="Rehost"
                disabled={rehostPrintingImage.isPending}
                onClick={() => rehostPrintingImage.mutate(effectiveImage.id)}
              >
                <DownloadIcon className="size-3" />
              </Button>
            )}
            {effectiveImage.rehostedUrl && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  title={`Rotate left (current: ${effectiveImage.rotation}°)`}
                  disabled={rotatePrintingImage.isPending}
                  onClick={() =>
                    rotatePrintingImage.mutate({
                      imageId: effectiveImage.id,
                      rotation: ((effectiveImage.rotation + 270) % 360) as Rotation,
                    })
                  }
                >
                  <RotateCcwIcon className="size-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  title={`Rotate right (current: ${effectiveImage.rotation}°)`}
                  disabled={rotatePrintingImage.isPending}
                  onClick={() =>
                    rotatePrintingImage.mutate({
                      imageId: effectiveImage.id,
                      rotation: ((effectiveImage.rotation + 90) % 360) as Rotation,
                    })
                  }
                >
                  <RotateCwIcon className="size-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  title={
                    effectiveImage.needsTrim
                      ? "Auto-trim is ON — click to turn off (regenerates variants; -orig preserved)"
                      : "Auto-trim is OFF — click to enable for scans (regenerates variants; -orig preserved)"
                  }
                  disabled={setNeedsTrim.isPending}
                  onClick={() =>
                    setNeedsTrim.mutate({
                      imageId: effectiveImage.id,
                      needsTrim: !effectiveImage.needsTrim,
                    })
                  }
                >
                  {effectiveImage.needsTrim ? (
                    <ScissorsIcon className="text-success size-3" />
                  ) : (
                    <ScissorsLineDashedIcon className="size-3" />
                  )}
                </Button>
              </>
            )}
            {isAdmin && effectiveImage.rehostedUrl && effectiveImage.originalUrl && (
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                title="Un-rehost (delete files)"
                disabled={unrehostPrintingImage.isPending}
                onClick={() => unrehostPrintingImage.mutate(effectiveImage.id)}
              >
                <XIcon className="size-3" />
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive size-6"
                title="Remove"
                disabled={deletePrintingImage.isPending}
                onClick={() => deletePrintingImage.mutate(effectiveImage.id)}
              >
                <Trash2Icon className="size-3" />
              </Button>
            )}
          </div>
        </div>
      )}
      {!effectiveImage && effectiveSource && (
        <div className="flex min-h-6 items-center gap-1">
          <Badge variant="outline">Source</Badge>
          <span className="text-muted-foreground">{effectiveSource.source}</span>
          <div className="ml-auto flex items-center gap-0.5">
            <Button
              variant="ghost"
              className="h-6 px-1.5"
              disabled={setPrintingSourceImage.isPending}
              onClick={() =>
                setPrintingSourceImage.mutate(
                  { candidatePrintingId: effectiveSource.candidatePrintingId, mode: "main" },
                  { onSuccess: () => setSelectedId(null) },
                )
              }
            >
              <PlusIcon className="mr-0.5 size-3" />
              Main
            </Button>
            <Button
              variant="ghost"
              className="h-6 px-1.5"
              disabled={setPrintingSourceImage.isPending}
              onClick={() =>
                setPrintingSourceImage.mutate(
                  { candidatePrintingId: effectiveSource.candidatePrintingId, mode: "additional" },
                  { onSuccess: () => setSelectedId(null) },
                )
              }
            >
              <PlusIcon className="mr-0.5 size-3" />
              Alt
            </Button>
          </div>
        </div>
      )}

      {/* Image source tabs */}
      <div className="flex flex-wrap items-center gap-1">
        {sortedImages.map((img) => {
          const isSelected = effectiveImage?.id === img.id;
          return (
            <Toggle
              key={img.id}
              pressed={isSelected}
              onPressedChange={() => {
                setSelectedId(isSelected ? null : img.id);
                setResolution(null);
                setImgError(false);
              }}
              className={cn(
                "aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:hover:bg-primary aria-pressed:hover:text-primary-foreground h-6 min-w-0 rounded-md px-1.5 font-normal",
                img.isActive ? "bg-muted font-medium" : "bg-muted/50 text-muted-foreground",
              )}
            >
              {imageLabel(img)}
              {img.rehostedUrl ? null : <span className="text-warning"> !</span>}
            </Toggle>
          );
        })}
        {sortedSourceImages.map((si) => (
          <Toggle
            key={si.candidatePrintingId}
            pressed={effectiveSource?.candidatePrintingId === si.candidatePrintingId}
            onPressedChange={() => {
              setSelectedId(
                effectiveSource?.candidatePrintingId === si.candidatePrintingId
                  ? null
                  : si.candidatePrintingId,
              );
              setResolution(null);
              setImgError(false);
            }}
            className="aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-foreground text-muted-foreground h-6 min-w-0 rounded-md border border-dashed px-1.5 font-normal"
          >
            {si.source}
          </Toggle>
        ))}
      </div>

      {/* Add from URL / Upload */}
      {isAdmin && (
        <div className="flex gap-1">
          <Button variant="outline" onClick={() => setShowUrlInput((v) => !v)}>
            <ImagePlusIcon className="mr-1" />
            From URL
          </Button>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadPrintingImage.isPending}
          >
            <UploadIcon className="mr-1" />
            Upload
          </Button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        aria-label="Upload printing image"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            uploadPrintingImage.mutate({ printingId, file, mode: "main" });
            e.target.value = "";
          }
        }}
      />

      {showUrlInput && (
        <div className="flex gap-1">
          <Input
            placeholder="Image URL…"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            className="flex-1"
          />
          <Button
            variant="outline"
            disabled={!urlValue.trim() || addImageFromUrl.isPending}
            onClick={() => {
              addImageFromUrl.mutate(
                {
                  printingId,
                  url: urlValue.trim(),
                  mode: "main",
                },
                {
                  onSuccess: () => {
                    setUrlValue("");
                    setShowUrlInput(false);
                  },
                },
              );
            }}
          >
            Add
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setShowUrlInput(false);
              setUrlValue("");
            }}
          >
            <XIcon className="size-3" />
          </Button>
        </div>
      )}

      {/*
        Substitute art. Only shown while the printing has no active front image,
        which is the only time it has any effect — an override on a scanned
        printing changes nothing on screen and reads as a setting that does
        nothing. It stays stored either way, so a pin made before a scan arrives
        comes back into play if that scan is ever removed.
      */}
      {!activeFrontImage && (
        <div className="space-y-1 border-t pt-2">
          <div className="flex min-h-6 items-center gap-1">
            <span className="text-muted-foreground">Substitute art</span>
            {fallbackArtMode === "pinned" && fallbackImageFileId !== null && (
              <ImgWithFallback
                src={imageUrl(fallbackImageFileId, "120w")}
                alt="Pinned substitute art"
                className="h-8 w-auto rounded-sm"
                fallback={
                  <Badge variant="outline" className="text-warning">
                    Not rehosted
                  </Badge>
                }
              />
            )}
            {fallbackArtMode === "pinned" && pinnedSibling === undefined && (
              <span className="text-muted-foreground">external</span>
            )}
            {fallbackArtMode === "pinned" && pinnedSibling !== undefined && (
              <span className="text-muted-foreground truncate">{pinnedSibling.printingLabel}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Toggle
              pressed={fallbackArtMode === "auto"}
              disabled={setFallbackArt.isPending}
              onPressedChange={() => setFallbackArt.mutate({ printingId, mode: "auto" })}
              className={FALLBACK_TOGGLE_CLASS}
              title={
                derivedArtLabel === null
                  ? "Show the standard printing's art (same language, else EN). This card has none with art, so nothing is shown."
                  : `Show the standard printing's art (same language, else EN): ${derivedArtLabel}`
              }
            >
              Derived ({derivedArtLabel ?? "no source"})
            </Toggle>
            <Toggle
              pressed={fallbackArtMode === "none"}
              disabled={setFallbackArt.isPending}
              onPressedChange={() => setFallbackArt.mutate({ printingId, mode: "none" })}
              className={FALLBACK_TOGGLE_CLASS}
              title="Show no substitute — the drawn placeholder only"
            >
              None
            </Toggle>
            {siblingImages.map((sibling) => (
              <Toggle
                key={sibling.imageFileId}
                pressed={
                  fallbackArtMode === "pinned" && fallbackImageFileId === sibling.imageFileId
                }
                disabled={setFallbackArt.isPending}
                onPressedChange={() =>
                  setFallbackArt.mutate({
                    printingId,
                    mode: "pinned",
                    imageFileId: sibling.imageFileId,
                  })
                }
                className={FALLBACK_TOGGLE_CLASS}
                title={`Pin the art from ${sibling.printingLabel}`}
              >
                {sibling.printingLabel}
              </Toggle>
            ))}
          </div>
          {isAdmin && (
            <div className="flex gap-1">
              <Button variant="outline" onClick={() => setShowFallbackUrlInput((v) => !v)}>
                <ImagePlusIcon className="mr-1" />
                Pin URL
              </Button>
              <Button
                variant="outline"
                onClick={() => fallbackFileInputRef.current?.click()}
                disabled={uploadFallbackArt.isPending}
              >
                <UploadIcon className="mr-1" />
                Pin upload
              </Button>
            </div>
          )}
          {showFallbackUrlInput && (
            <div className="flex gap-1">
              <Input
                placeholder="Substitute art URL…"
                value={fallbackUrlValue}
                onChange={(e) => setFallbackUrlValue(e.target.value)}
                className="flex-1"
              />
              <Button
                variant="outline"
                disabled={!fallbackUrlValue.trim() || addFallbackArtUrl.isPending}
                onClick={() => {
                  addFallbackArtUrl.mutate(
                    { printingId, url: fallbackUrlValue.trim() },
                    {
                      onSuccess: () => {
                        setFallbackUrlValue("");
                        setShowFallbackUrlInput(false);
                      },
                    },
                  );
                }}
              >
                Pin
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowFallbackUrlInput(false);
                  setFallbackUrlValue("");
                }}
              >
                <XIcon className="size-3" />
              </Button>
            </div>
          )}
        </div>
      )}

      <input
        ref={fallbackFileInputRef}
        type="file"
        aria-label="Upload substitute art"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            uploadFallbackArt.mutate({ printingId, file });
            e.target.value = "";
          }
        }}
      />
    </div>
  );
}
