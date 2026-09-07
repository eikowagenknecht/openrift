import { useState } from "react";

import {
  isAcceptedImageType,
  scaledDimensions,
  shouldDownscale,
} from "@/features/designer/lib/card-designer";
import { useCardDesignerStore } from "@/features/designer/stores/card-designer-store";

export function readFileAsDataUrl(file: Blob): Promise<string> {
  // oxlint-disable-next-line promise/avoid-new -- wrapping the FileReader callback API
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      resolve(reader.result as string);
    });
    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("Failed to read file."));
    });
    reader.readAsDataURL(file);
  });
}

/**
 * Best-effort: any failure (no canvas, decode error) yields the input
 * unchanged with an unknown aspect so the upload still succeeds.
 */
function prepareImage(dataUrl: string): Promise<{ dataUrl: string; aspect: number | null }> {
  // oxlint-disable-next-line promise/avoid-new -- wrapping the HTMLImageElement load callbacks
  return new Promise<{ dataUrl: string; aspect: number | null }>((resolve) => {
    const image = new Image();
    image.addEventListener("load", () => {
      const aspect =
        image.naturalWidth > 0 && image.naturalHeight > 0
          ? image.naturalWidth / image.naturalHeight
          : null;
      if (!shouldDownscale(image.naturalWidth, image.naturalHeight)) {
        resolve({ dataUrl, aspect });
        return;
      }
      const { width, height } = scaledDimensions(image.naturalWidth, image.naturalHeight);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        resolve({ dataUrl, aspect });
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      resolve({ dataUrl: canvas.toDataURL("image/png"), aspect });
    });
    image.addEventListener("error", () => {
      resolve({ dataUrl, aspect: null });
    });
    image.src = dataUrl;
  });
}

interface UseImageUpload {
  handleFile: (file: File) => Promise<void>;
  loading: boolean;
  error: string | null;
}

/** Nothing is uploaded to a server; the image is read and resized client-side. */
export function useImageUpload(): UseImageUpload {
  const setImage = useCardDesignerStore((state) => state.setImage);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setError(null);
    if (!isAcceptedImageType(file.type)) {
      setError("That doesn't look like an image. Pick a PNG, JPG, or WebP.");
      return;
    }
    setLoading(true);
    const prepared = await readFileAsDataUrl(file)
      .then(prepareImage)
      .catch(() => null);
    if (prepared) {
      setImage(prepared.dataUrl, prepared.aspect);
    } else {
      setError("Couldn't read that image. Try another file.");
    }
    setLoading(false);
  };

  return { handleFile, loading, error };
}
