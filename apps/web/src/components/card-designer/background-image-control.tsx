import { ImageUpIcon, Trash2Icon } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useImageUpload } from "@/hooks/use-image-upload";
import { CARD_MAX_ZOOM, CARD_MIN_ZOOM } from "@/lib/card-designer";
import { useCardDesignerStore } from "@/stores/card-designer-store";

export function BackgroundImageControl() {
  const dataUrl = useCardDesignerStore((state) => state.background.dataUrl);
  const scale = useCardDesignerStore((state) => state.background.scale);
  const setImageTransform = useCardDesignerStore((state) => state.setImageTransform);
  const clearImage = useCardDesignerStore((state) => state.clearImage);
  const { handleFile, loading, error } = useImageUpload();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void handleFile(file);
    }
    // Reset so picking the same file again still fires onChange.
    event.target.value = "";
  };

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        aria-label="Background image file"
        className="sr-only"
        onChange={handleChange}
      />
      <Button
        type="button"
        variant="outline"
        disabled={loading}
        onClick={() => inputRef.current?.click()}
      >
        <ImageUpIcon className="size-4" />
        {dataUrl ? "Replace background image" : "Upload background image"}
      </Button>
      {error && <p className="text-destructive text-sm">{error}</p>}
      {dataUrl && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Zoom</span>
            <Slider
              aria-label="Background zoom"
              min={CARD_MIN_ZOOM}
              max={CARD_MAX_ZOOM}
              step={0.01}
              value={scale}
              onValueChange={(value) => {
                setImageTransform({ scale: typeof value === "number" ? value : value[0] });
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-sm">Drag the card to reposition.</p>
            <Button type="button" variant="ghost" size="sm" onClick={clearImage}>
              <Trash2Icon className="size-4" />
              Remove
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
