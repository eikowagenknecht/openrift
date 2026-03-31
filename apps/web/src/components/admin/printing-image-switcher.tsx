import type { AdminPrintingImageResponse, ProviderSettingResponse } from "@openrift/shared";
import {
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  ImagePlusIcon,
  PlusIcon,
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
  useSetCandidatePrintingImage,
  useUnrehostPrintingImage,
  useUploadPrintingImage,
} from "@/hooks/use-admin-cards";

function getDisplayUrl(img: AdminPrintingImageResponse): string | null {
  return img.rehostedUrl ? `${img.rehostedUrl}-full.webp` : img.originalUrl;
}

export function PrintingImageSwitcher({
  printingId,
  printingLabel,
  images,
  sourceImages,
  providerSettings,
}: {
  printingId: string;
  printingLabel: string;
  images: AdminPrintingImageResponse[];
  sourceImages: DeduplicatedSourceImage[];
  providerSettings: ProviderSettingResponse[];
}) {
  const deletePrintingImage = useDeletePrintingImage();
  const activatePrintingImage = useActivatePrintingImage();
  const rehostPrintingImage = useRehostPrintingImage();
  const unrehostPrintingImage = useUnrehostPrintingImage();
  const addImageFromUrl = useAddImageFromUrl();
  const uploadPrintingImage = useUploadPrintingImage();
  const setPrintingSourceImage = useSetCandidatePrintingImage();

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
      {/* Image tabs + add buttons */}
      <div className="flex flex-wrap items-center gap-1">
        {sortedImages.map((img) => {
          const isSelected = effectiveImage?.id === img.id;
          return (
            <button
              key={img.id}
              type="button"
              className={`rounded px-1.5 py-0.5 text-[10px] ${
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
            className={`rounded border border-dashed px-1.5 py-0.5 text-[10px] ${
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
        <Button
          variant="ghost"
          size="icon"
          className="size-5"
          title="Add from URL"
          onClick={() => setShowUrlInput((v) => !v)}
        >
          <ImagePlusIcon className="size-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-5"
          title="Upload image"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadPrintingImage.isPending}
        >
          <UploadIcon className="size-3" />
        </Button>
      </div>

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
        <div className="space-y-0.5">
          {effectiveImage?.originalUrl && (
            <a
              href={effectiveImage.originalUrl}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground block truncate text-[10px]"
              title={effectiveImage.originalUrl}
            >
              {effectiveImage.originalUrl}
            </a>
          )}
          {effectiveImage?.rehostedUrl && (
            <a
              href={`${effectiveImage.rehostedUrl}-full.webp`}
              target="_blank"
              rel="noreferrer"
              className="block truncate text-[10px] text-green-600 hover:text-green-500"
              title={`${effectiveImage.rehostedUrl}-full.webp`}
            >
              {effectiveImage.rehostedUrl.split("/").pop()}-full.webp
            </a>
          )}
          {effectiveSource && (
            <a
              href={effectiveSource.url}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground hover:text-foreground block truncate text-[10px]"
              title={effectiveSource.url}
            >
              {effectiveSource.url}
            </a>
          )}
        </div>
      )}

      {/* Status + actions bar */}
      {effectiveImage && (
        <div className="flex items-center gap-1">
          {effectiveImage.isActive ? (
            <Badge variant="default" className="h-4 text-[10px] leading-none">
              Active
            </Badge>
          ) : (
            <Badge variant="secondary" className="h-4 text-[10px] leading-none">
              Inactive
            </Badge>
          )}
          {effectiveImage.rehostedUrl ? (
            <Badge variant="outline" className="h-4 text-[10px] leading-none text-green-600">
              Rehosted
            </Badge>
          ) : (
            <Badge variant="outline" className="h-4 text-[10px] leading-none text-orange-600">
              External
            </Badge>
          )}
          <span className="text-muted-foreground text-[10px]">{effectiveImage.provider}</span>
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
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="h-4 text-[10px] leading-none">
            Source
          </Badge>
          <span className="text-muted-foreground text-[10px]">{effectiveSource.source}</span>
          <div className="ml-auto flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px]"
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
              size="sm"
              className="h-6 text-[10px]"
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
            className="h-7 text-xs"
          />
          <div className="flex gap-1">
            <Input
              placeholder="Source name"
              value={urlSource}
              onChange={(e) => setUrlSource(e.target.value)}
              className="h-7 flex-1 text-xs"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
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
              size="sm"
              className="h-7 text-xs"
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
