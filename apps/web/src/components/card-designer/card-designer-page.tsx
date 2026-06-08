import { useRef, useState } from "react";

import { BackgroundImageControl } from "@/components/card-designer/background-image-control";
import { CardDesignerForm } from "@/components/card-designer/card-designer-form";
import { CardDesignerPreview } from "@/components/card-designer/card-designer-preview";
import { CardExportControls } from "@/components/card-designer/card-export-controls";
import type { ExportAction } from "@/lib/card-export";
import { CARD_EXPORT_WIDTH, exportCardImage, waitForRender } from "@/lib/card-export";
import { nameToSlug } from "@/lib/contribute-json";
import { getFilterIconPath, getTypeIconPath } from "@/lib/icons";
import { prewarmTintedIcons, TINT_BLACK, TINT_WHITE } from "@/lib/white-icon";
import type { DesignerCard } from "@/stores/card-designer-store";
import { useCardDesignerStore } from "@/stores/card-designer-store";

// The glyph icons the card renders, with the color they're tinted to, so they
// can be pre-tinted before the export clone is captured (html2canvas can't apply
// the CSS color filters). Mirrors CardPlaceholderImage.
function designerTintedIcons(card: DesignerCard): { src: string; color: string }[] {
  const white = new Set<string>();
  for (const domain of card.domains) {
    const path = getFilterIconPath("domains", domain);
    if (path) {
      white.add(path);
    }
  }
  // Multi-domain cards render the generic rune for power pips (see CardPlaceholderImage).
  if (card.domains.length > 1) {
    white.add("/images/glyphs/rune-rainbow.svg");
  }
  const typeIcon = card.type ? getTypeIconPath(card.type, card.superTypes) : undefined;
  if (typeIcon) {
    white.add(typeIcon);
  }
  white.add("/images/artist.svg");
  white.add("/logo.svg");

  const icons = [...white].map((src) => ({ src, color: TINT_WHITE }));
  // The might shield's symbol is black on its white left half.
  if (card.might !== null) {
    icons.push({ src: "/images/might.svg", color: TINT_BLACK });
  }
  return icons;
}

/**
 * Card designer layout: the field editor beside a sticky live preview with the
 * background-image controls and export buttons. Owns the off-screen, fixed-size
 * render clone used to rasterize the export at a deterministic width.
 *
 * @returns The card designer page element.
 */
export function CardDesignerPage() {
  const cardName = useCardDesignerStore((state) => state.card.name);
  const cloneRef = useRef<HTMLDivElement>(null);
  const [renderClone, setRenderClone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function runExport(action: ExportAction) {
    if (busy) {
      return;
    }
    setStatus(null);
    setBusy(true);
    // Tint the white glyph icons before rendering the clone, so its synchronous
    // render finds them cached (html2canvas ignores the CSS white filter).
    await prewarmTintedIcons(designerTintedIcons(useCardDesignerStore.getState().card));
    setRenderClone(true);
    await waitForRender();
    const element = cloneRef.current;
    const filename = `${nameToSlug(cardName) || "riftbound-card"}.png`;
    const outcome = element
      ? await exportCardImage(element, action, filename).catch(() => null)
      : null;
    setRenderClone(false);
    setBusy(false);
    if (outcome === "copied") {
      setStatus("Copied to clipboard.");
    } else if (outcome === "downloaded") {
      setStatus(
        action === "copy" ? "Clipboard unavailable — downloaded instead." : "Image downloaded.",
      );
    } else {
      setStatus("Couldn't export the card. Try again.");
    }
  }

  return (
    <>
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="order-2 flex flex-col gap-6 lg:order-1">
          <CardDesignerForm />
        </div>
        <div className="order-1 flex flex-col gap-4 lg:sticky lg:top-20 lg:order-2">
          <CardDesignerPreview interactive className="mx-auto w-full max-w-xs" />
          <BackgroundImageControl />
          <CardExportControls
            onDownload={() => void runExport("download")}
            onCopy={() => void runExport("copy")}
            busy={busy}
            status={status}
          />
        </div>
      </div>
      {renderClone && (
        <div
          ref={cloneRef}
          aria-hidden="true"
          style={{
            position: "fixed",
            left: -99_999,
            top: 0,
            width: CARD_EXPORT_WIDTH,
            pointerEvents: "none",
          }}
        >
          <CardDesignerPreview forExport />
        </div>
      )}
    </>
  );
}
