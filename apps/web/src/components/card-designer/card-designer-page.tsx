import { WellKnown } from "@openrift/shared";
import { useRef, useState } from "react";

import { BackgroundImageControl } from "@/components/card-designer/background-image-control";
import { CardDesignerForm } from "@/components/card-designer/card-designer-form";
import { CardDesignerPreview } from "@/components/card-designer/card-designer-preview";
import { CardExportControls } from "@/components/card-designer/card-export-controls";
import { TYPE_ICON_COLOR } from "@/components/cards/card-placeholder-image";
import { useDomainColors } from "@/hooks/use-domain-colors";
import type { ExportAction } from "@/lib/card-export";
import { CARD_EXPORT_WIDTH, exportCardImage, waitForRender } from "@/lib/card-export";
import { nameToSlug } from "@/lib/contribute-json";
import { getPipGlyphTint } from "@/lib/domain";
import { getFilterIconPath, getTypeIconPath } from "@/lib/icons";
import { prewarmTintedIcons, TINT_BLACK, TINT_WHITE } from "@/lib/white-icon";
import type { DesignerCard } from "@/stores/card-designer-store";
import { useCardDesignerStore } from "@/stores/card-designer-store";

// Pre-tints the glyph icons before the export clone is captured, since
// html2canvas can't apply the CSS color filters. Mirrors CardPlaceholderImage.
function designerTintedIcons(
  card: DesignerCard,
  domainColors: Record<string, string>,
): { src: string; color: string }[] {
  const white = new Set<string>();
  for (const domain of card.domains) {
    const path = getFilterIconPath("domains", domain);
    if (path) {
      white.add(path);
    }
  }
  white.add("/images/artist.svg");
  white.add("/logo.svg");

  const icons = [...white].map((src) => ({ src, color: TINT_WHITE }));
  // The card-type glyph shows in gold in its black pip above the title.
  const typeIcon = card.type ? getTypeIconPath(card.type, card.superTypes) : undefined;
  if (typeIcon) {
    icons.push({ src: typeIcon, color: TYPE_ICON_COLOR });
  }
  // The might shield's symbol is black on its white left half.
  if (card.might !== null) {
    icons.push({ src: "/images/might.svg", color: TINT_BLACK });
  }
  // Power pip rune tint must contrast with the domain background (black on order/body domains); see CardPlaceholderImage.
  if (card.power !== null && card.power > 0) {
    const runeSrc =
      card.domains.length > 1
        ? "/images/glyphs/rune-rainbow.svg"
        : getFilterIconPath("domains", card.domains[0] ?? WellKnown.domain.COLORLESS);
    if (runeSrc) {
      const tint =
        getPipGlyphTint(card.domains, domainColors) === "black" ? TINT_BLACK : TINT_WHITE;
      icons.push({ src: runeSrc, color: tint });
    }
  }
  return icons;
}

export function CardDesignerPage() {
  const cardName = useCardDesignerStore((state) => state.card.name);
  const domainColors = useDomainColors();
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
    await prewarmTintedIcons(
      designerTintedIcons(useCardDesignerStore.getState().card, domainColors),
    );
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
        action === "copy" ? "Clipboard unavailable, downloaded instead." : "Image downloaded.",
      );
    } else {
      setStatus("Couldn't export the card. Try again.");
    }
  }

  return (
    <>
      {/* grid-cols-1 matters: without it the implicit column sizes to the
          form's widest row and the whole page clips past a phone viewport. */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
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
