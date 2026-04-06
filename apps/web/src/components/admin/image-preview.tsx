import type { CandidatePrintingResponse, ProviderSettingResponse } from "@openrift/shared";
import { useState } from "react";

import {
  deduplicateSourceImages,
  sortByProviderOrder,
} from "@/components/admin/card-detail-shared";

// ---------------------------------------------------------------------------
// ImagePreview — single image with resolution overlay
// ---------------------------------------------------------------------------

export function ImagePreview({
  url,
  alt,
  resolution,
  setResolution,
  imgError,
  setImgError,
}: {
  url: string | null;
  alt: string;
  resolution: string | null;
  setResolution: (v: string | null) => void;
  imgError: boolean;
  setImgError: (v: boolean) => void;
}) {
  return (
    <div className="relative">
      {url && !imgError ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img
            src={url}
            alt={alt}
            className="w-full rounded border object-contain"
            onLoad={(e) => {
              const img = e.currentTarget;
              setResolution(`${img.naturalWidth}×${img.naturalHeight}`);
            }}
            onError={() => setImgError(true)}
          />
        </a>
      ) : url && imgError ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="bg-muted/30 text-muted-foreground hover:bg-muted/50 flex aspect-[5/7] w-full items-center justify-center rounded border"
        >
          Failed to load — click to open
        </a>
      ) : (
        <div className="text-muted-foreground flex aspect-[5/7] w-full items-center justify-center rounded border">
          No image
        </div>
      )}
      {resolution && url && !imgError && (
        <span className="absolute right-1.5 bottom-1.5 rounded bg-black/60 px-1.5 py-0.5 text-white">
          {resolution}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// GroupImagePreview — read-only image preview for new/ambiguous groups
// ---------------------------------------------------------------------------

export function GroupImagePreview({
  sources,
  providerLabels,
  providerSettings,
}: {
  sources: CandidatePrintingResponse[];
  providerLabels: Record<string, string>;
  providerSettings: ProviderSettingResponse[];
}) {
  const sourceImages = deduplicateSourceImages(sources, providerLabels);
  sourceImages.sort((a, b) => sortByProviderOrder(providerSettings)(a.source, b.source));

  const [selectedId, setSelectedId] = useState<string | null>(
    () => sourceImages[0]?.candidatePrintingId ?? null,
  );
  const [resolution, setResolution] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  if (sourceImages.length === 0) {
    return null;
  }

  const selected =
    sourceImages.find((si) => si.candidatePrintingId === selectedId) ?? sourceImages[0];

  return (
    <div className="w-96 shrink-0 space-y-2">
      {/* Source image tabs */}
      <div className="flex flex-wrap items-center gap-1">
        {sourceImages.map((si) => (
          <button
            key={si.candidatePrintingId}
            type="button"
            className={`rounded border border-dashed px-1.5 py-0.5 ${
              selected.candidatePrintingId === si.candidatePrintingId
                ? "border-primary bg-primary/10"
                : "text-muted-foreground"
            }`}
            onClick={() => {
              setSelectedId(si.candidatePrintingId);
              setResolution(null);
              setImgError(false);
            }}
          >
            {si.source}
          </button>
        ))}
      </div>

      <ImagePreview
        url={selected.url}
        alt="source"
        resolution={resolution}
        setResolution={setResolution}
        imgError={imgError}
        setImgError={setImgError}
      />
      <a
        href={selected.url}
        target="_blank"
        rel="noreferrer"
        className="text-muted-foreground hover:text-foreground block truncate"
        title={selected.url}
      >
        {selected.url}
      </a>
    </div>
  );
}
