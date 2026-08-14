import type { OverlayChannelResponse, OverlayCorner } from "@openrift/shared";
import { RefreshCwIcon } from "lucide-react";
import { useState } from "react";

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

/**
 * Scene setup: where the card sits, how big it is, what rides along with it,
 * and the browser-source URL to paste into OBS.
 *
 * These get set once against a layout and then left alone, which is why they
 * live apart from the search-and-push surface rather than in the same column.
 *
 * @returns The settings panel.
 */
export function OverlaySettingsPanel({ channel }: { channel: OverlayChannelResponse }) {
  const updateSettings = useUpdateOverlaySettings();
  const rotateToken = useRotateOverlayToken();
  const { payload } = channel;

  // Local while dragging so the label tracks the thumb; the write happens on
  // release. Each write bumps the version, and a dragged slider would push
  // twenty of them straight at the poll.
  const [draftScale, setDraftScale] = useState<number | null>(null);
  const shownScale = draftScale ?? payload.scale;

  const sourceUrl = `${getSiteUrl()}/overlay/${channel.token}`;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">Browser source</h2>
        <p className="text-muted-foreground text-sm">
          Add a Browser source in OBS, paste this URL, and size it to your canvas. Anyone with the
          link sees what you push, so keep it out of shot.
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
                setDraftScale(next);
              }
            }}
            onValueCommitted={(value) => {
              const next = Array.isArray(value) ? value[0] : value;
              setDraftScale(null);
              if (typeof next === "number" && next !== payload.scale) {
                updateSettings.mutate({ scale: next });
              }
            }}
          />
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="font-semibold">What rides along</h2>

        <div className="flex items-center justify-between gap-4">
          <Label htmlFor="overlay-plate">Name and stats plate</Label>
          <Switch
            id="overlay-plate"
            checked={payload.showPlate}
            onCheckedChange={(checked) => updateSettings.mutate({ showPlate: checked })}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="overlay-deck-url">Deck link for the QR code</Label>
          <Input
            id="overlay-deck-url"
            type="url"
            defaultValue={payload.deckShareUrl ?? ""}
            placeholder="https://openrift.app/decks/share/…"
            // Committed on blur, so a half-typed URL never reaches the stream.
            onBlur={(event) => {
              const next = event.target.value.trim();
              const current = payload.deckShareUrl ?? "";
              if (next !== current) {
                updateSettings.mutate({ deckShareUrl: next === "" ? null : next });
              }
            }}
          />
          <p className="text-muted-foreground text-sm">
            Paste a deck share link and viewers can scan it off the stream. Leave it empty to hide
            the code.
          </p>
        </div>
      </section>
    </div>
  );
}
