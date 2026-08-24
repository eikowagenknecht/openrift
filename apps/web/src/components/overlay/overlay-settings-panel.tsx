import type {
  OverlayChannelResponse,
  OverlayCorner,
  OverlayPlateFields,
  OverlayPlatePosition,
} from "@openrift/shared";
import { RefreshCwIcon } from "lucide-react";

import { OverlayPresetsSection } from "@/components/overlay/overlay-presets-section";
import { ShareLinkRow } from "@/components/share/share-link-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useRotateOverlayToken, useUpdateOverlaySettings } from "@/hooks/use-overlay";
import { getSiteUrl } from "@/lib/site-config";

const CORNERS: { value: OverlayCorner; label: string }[] = [
  { value: "top-left", label: "Top left" },
  { value: "top-right", label: "Top right" },
  { value: "bottom-left", label: "Bottom left" },
  { value: "bottom-right", label: "Bottom right" },
];

function isCorner(value: unknown): value is OverlayCorner {
  return CORNERS.some((corner) => corner.value === value);
}

const PLATE_POSITIONS: { value: OverlayPlatePosition; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "above", label: "Above" },
  { value: "below", label: "Below" },
];

function isPlatePosition(value: unknown): value is OverlayPlatePosition {
  return PLATE_POSITIONS.some((position) => position.value === value);
}

const PLATE_FIELDS: { key: keyof OverlayPlateFields; label: string }[] = [
  { key: "name", label: "Card name" },
  { key: "code", label: "Set code and foil" },
  { key: "stats", label: "Energy, power and might" },
  { key: "rulesText", label: "Rules text" },
  { key: "flavorText", label: "Flavor text" },
];

/**
 * Scene setup: where the card sits, how big it is, what rides along with it,
 * and the browser-source URL to paste into OBS.
 *
 * These get set once against a layout and then left alone, which is why they
 * sit at the bottom of the OBS output, below the controls a creator reaches for
 * mid-stream.
 *
 * @param props.draftScale The size being dragged, or null when the thumb is at rest.
 * @param props.onDraftScaleChange Reports the dragged size so the preview can follow it.
 * @returns The settings panel.
 */
export function OverlaySettingsPanel({
  channel,
  draftScale,
  onDraftScaleChange,
}: {
  channel: OverlayChannelResponse;
  draftScale: number | null;
  onDraftScaleChange: (scale: number | null) => void;
}) {
  const updateSettings = useUpdateOverlaySettings();
  const rotateToken = useRotateOverlayToken();
  const { payload } = channel;

  // The draft lives in the output panel rather than here so the live preview
  // resizes with the thumb; the write still happens on release, because each
  // one bumps the version and a dragged slider would push twenty of them
  // straight at the poll.
  const shownScale = draftScale ?? payload.scale;

  const sourceUrl = `${getSiteUrl()}/stage/source/${channel.token}`;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Browser source</h2>
        <p className="text-muted-foreground text-sm">
          Add a Browser source in OBS and paste this URL. Anyone with the link sees what you push.
        </p>
        <ShareLinkRow
          url={sourceUrl}
          label="OBS browser source URL"
          hideQr
          actions={
            <Button
              variant="outline"
              onClick={() => rotateToken.mutate()}
              disabled={rotateToken.isPending}
              title="Issues a new URL. The old one stops working immediately."
            >
              <RefreshCwIcon />
              New link
            </Button>
          }
        />
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold">Placement</h2>

        <div className="flex flex-col gap-2">
          <Label>Corner</Label>
          <ToggleGroup
            aria-label="Corner"
            variant="outline"
            value={[payload.corner]}
            onValueChange={([next]) => {
              if (isCorner(next)) {
                updateSettings.mutate({ corner: next });
              }
            }}
            className="grid w-full grid-cols-2"
          >
            {CORNERS.map((corner) => (
              <ToggleGroupItem key={corner.value} value={corner.value}>
                {corner.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Card size — {shownScale}% of the canvas height</Label>
          <Slider
            aria-label="Card size"
            min={20}
            max={100}
            step={5}
            value={[shownScale]}
            onValueChange={(value) => {
              const next = Array.isArray(value) ? value[0] : value;
              if (typeof next === "number") {
                onDraftScaleChange(next);
              }
            }}
            onValueCommitted={(value) => {
              const next = Array.isArray(value) ? value[0] : value;
              onDraftScaleChange(null);
              if (typeof next === "number" && next !== payload.scale) {
                updateSettings.mutate({ scale: next });
              }
            }}
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-semibold">Card plate</h2>
          <Switch
            id="overlay-plate"
            aria-label="Card plate"
            checked={payload.showPlate}
            onCheckedChange={(checked) => updateSettings.mutate({ showPlate: checked })}
          />
        </div>

        {payload.showPlate && (
          <>
            <div className="flex flex-col gap-2">
              <Label>Where it sits</Label>
              <ToggleGroup
                aria-label="Plate position"
                variant="outline"
                value={[payload.platePosition]}
                onValueChange={([next]) => {
                  if (isPlatePosition(next)) {
                    updateSettings.mutate({ platePosition: next });
                  }
                }}
                className="grid w-full grid-cols-5"
              >
                {PLATE_POSITIONS.map((position) => (
                  <ToggleGroupItem key={position.value} value={position.value}>
                    {position.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <p className="text-muted-foreground text-sm">
                Auto keeps the plate on the card&apos;s inward side, so it follows the corner.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <Label>What it shows</Label>
              {PLATE_FIELDS.map((field) => (
                <div key={field.key} className="flex items-center justify-between gap-4">
                  <Label htmlFor={`overlay-plate-${field.key}`} className="font-normal">
                    {field.label}
                  </Label>
                  <Switch
                    id={`overlay-plate-${field.key}`}
                    checked={payload.plateFields[field.key]}
                    onCheckedChange={(checked) =>
                      updateSettings.mutate({ plateFields: { [field.key]: checked } })
                    }
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">QR code</h2>
        <Label htmlFor="overlay-qr-url">Link to put on screen</Label>
        <Input
          id="overlay-qr-url"
          type="url"
          defaultValue={payload.qrUrl ?? ""}
          placeholder="https://openrift.app/decks/share/…"
          // Committed on blur, so a half-typed URL never reaches the stream.
          onBlur={(event) => {
            const next = event.target.value.trim();
            const current = payload.qrUrl ?? "";
            if (next !== current) {
              updateSettings.mutate({ qrUrl: next === "" ? null : next });
            }
          }}
        />
        <p className="text-muted-foreground text-sm">Any link. Leave empty to hide the code.</p>
      </section>

      <OverlayPresetsSection channel={channel} />
    </div>
  );
}
