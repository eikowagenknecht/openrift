import type { AdminPrintingImageResponse, ProviderSettingResponse } from "@openrift/shared";
import {
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  ImagePlusIcon,
  PlusIcon,
  RotateCcwIcon,
  RotateCwIcon,
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
import { Input } from "@/components/ui/input";
import {
  useActivatePrintingImage,
  useAddImageFromUrl,
  useDeletePrintingImage,
  useRehostPrintingImage,
  useRotatePrintingImage,
  useSetCandidatePrintingImage,
  useUnrehostPrintingImage,
  useUploadPrintingImage,
} from "@/hooks/use-admin-image-mutations";

type Rotation = 0 | 90 | 180 | 270;

function getDisplayUrl(img: AdminPrintingImageResponse): string | null {
  if (!img.rehostedUrl) {
    return img.originalUrl;
  }
  // Cache-bust on rotation so admins see the rotated result immediately —
  // the rehosted URL is stable but the file behind it is rewritten in place.
  return `${img.rehostedUrl}-full.webp?r=${img.rotation}`;
}

export function PrintingImageSwitcher({
  printingId,
  printingLabel,
  images,
  sourceImages,
  providerSettings,
  invalidates,
}: {
  printingId: string;
  printingLabel: string;
  images: AdminPrintingImageResponse[];
  sourceImages: DeduplicatedSourceImage[];
  providerSettings: ProviderSettingResponse[];
  invalidates?: readonly (readonly unknown[])[];
}) {
  const deletePrintingImage = useDeletePrintingImage(invalidates);
  const activatePrintingImage = useActivatePrintingImage(invalidates);
  const rehostPrintingImage = useRehostPrintingImage(invalidates);
  const unrehostPrintingImage = useUnrehostPrintingImage(invalidates);
  const rotatePrintingImage = useRotatePrintingImage(invalidates);
  const addImageFromUrl = useAddImageFromUrl(invalidates);
  const uploadPrintingImage = useUploadPrintingImage(invalidates);
  const setPrintingSourceImage = useSetCandidatePrintingImage(invalidates);

  const orderSort = sortByProviderOrder(providerSettings);
  const sortedImages = images.toSorted((a, b) => orderSort(a.provider, b.provider));
  const sortedSourceImages = sourceImages.toSorted((a, b) => orderSort(a.source, b.source));

  const [selectedId, setSelectedId] = useState<string | null>(
    () => sortedImages[0]?.id ?? sortedSourceImages[0]?.candidatePrintingId ?? null,
  );
  const [resolution, setResolution] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlValue, setUrlValue] = useState("");
  const [urlSource, setUrlSource] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedImage = images.find((img) => img.id === selectedId);
  const selectedSource = sourceImages.find((si) => si.candidatePrintingId === selectedId);

  const activeImage = images.find((img) => img.isActive);
  const effectiveImage = selectedImage ?? (selectedId ? null : activeImage);
  const effectiveSource = selectedSource;
  const effectiveUrl = effectiveImage
    ? getDisplayUrl(effectiveImage)
    : (effectiveSource?.url ?? null);

  return (
    <div className="w-96 shrink-0 space-y-2">
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
              className="ml-auto truncate text-green-600 hover:text-green-500"
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
            <Badge variant="outline" className="text-green-600">
              Rehosted
            </Badge>
          ) : (
            <Badge variant="outline" className="text-orange-600">
              External
            </Badge>
          )}
          <span className="text-muted-foreground">{effectiveImage.provider}</span>
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
              </>
            )}
            {effectiveImage.rehostedUrl && effectiveImage.originalUrl && (
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
            <button
              key={img.id}
              type="button"
              className={`rounded px-1.5 py-0.5 ${
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : img.isActive
                    ? "bg-muted font-medium"
                    : "bg-muted/50 text-muted-foreground"
              }`}
              onClick={() => {
                setSelectedId(isSelected ? null : img.id);
                setResolution(null);
                setImgError(false);
              }}
            >
              {img.provider}
              {img.rehostedUrl ? null : <span className="text-orange-500"> !</span>}
            </button>
          );
        })}
        {sortedSourceImages.map((si) => (
          <button
            key={si.candidatePrintingId}
            type="button"
            className={`rounded border border-dashed px-1.5 py-0.5 ${
              effectiveSource?.candidatePrintingId === si.candidatePrintingId
                ? "border-primary bg-primary/10"
                : "text-muted-foreground"
            }`}
            onClick={() => {
              setSelectedId(
                effectiveSource?.candidatePrintingId === si.candidatePrintingId
                  ? null
                  : si.candidatePrintingId,
              );
              setResolution(null);
              setImgError(false);
            }}
          >
            {si.source}
          </button>
        ))}
      </div>

      {/* Add from URL / Upload */}
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

      <input
        ref={fileInputRef}
        type="file"
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
        <div className="space-y-1">
          <Input
            placeholder="Image URL…"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
          />
          <div className="flex gap-1">
            <Input
              placeholder="Source name"
              value={urlSource}
              onChange={(e) => setUrlSource(e.target.value)}
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
                    source: urlSource.trim() || undefined,
                    mode: "main",
                  },
                  {
                    onSuccess: () => {
                      setUrlValue("");
                      setUrlSource("");
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
                setUrlSource("");
              }}
            >
              <XIcon className="size-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
