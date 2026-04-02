import type { CatalogResponse } from "@openrift/shared";
import { useQueryClient } from "@tanstack/react-query";
import { html2canvas } from "html2canvas-pro";
import { Loader2Icon, PrinterIcon } from "lucide-react";
import { Suspense, useRef, useState } from "react";

import { CardPlaceholderImage } from "@/components/cards/card-placeholder-image";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { keywordStylesQueryOptions } from "@/hooks/use-keyword-styles";
import type { ProxyCard, ProxyPageSize, ProxyRenderMode, RenderedCard } from "@/lib/proxy-pdf";
import { assembleProxyPdf, prerenderImageCards, resolveProxyCards } from "@/lib/proxy-pdf";
import { queryKeys } from "@/lib/query-keys";
import { useDeckBuilderStore } from "@/stores/deck-builder-store";

const RENDER_MODE_LABELS: Record<ProxyRenderMode, string> = {
  image: "Card images",
  text: "Text placeholders",
};

const PAGE_SIZE_LABELS: Record<ProxyPageSize, string> = {
  a4: "A4",
  letter: "US Letter",
};

// Full render width for html2canvas capture (px)
const RENDER_WIDTH_PX = 504;
// Visual preview scale factor — keeps the card inside the dialog
const PREVIEW_SCALE = 200 / RENDER_WIDTH_PX;

/**
 * html2canvas supports clip-path polygon with percentages but not em/calc units.
 * Resolve clip-path values via getComputedStyle (which returns px) and convert
 * to percentages of the element's dimensions.
 */
function resolveClipPaths(element: HTMLElement): void {
  const inlineClip = element.style.clipPath;
  if (
    inlineClip &&
    inlineClip.includes("polygon") &&
    (inlineClip.includes("em") || inlineClip.includes("calc"))
  ) {
    const computed = getComputedStyle(element).clipPath;
    // Computed value is in px: "polygon(4.2px 0px, 95.8px 0px, 91.6px 20px, 0px 20px)"
    // Convert to percentages using element dimensions
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    if (width > 0 && height > 0 && computed.includes("polygon")) {
      const converted = computed.replaceAll(/[\d.]+px/g, (match, offset) => {
        const px = Number.parseFloat(match);
        // Determine if this is an x or y coordinate by counting commas and spaces before this point
        // In polygon(), coordinates alternate: x y, x y, ...
        // Count how many values came before this one in the current polygon
        const before = computed.slice(computed.indexOf("(") + 1, offset);
        const valueIndex = before.split(/[\s,]+/).filter(Boolean).length;
        const isX = valueIndex % 2 === 0;
        const percent = isX ? (px / width) * 100 : (px / height) * 100;
        return `${percent.toFixed(1)}%`;
      });
      element.style.clipPath = converted;
    }
  }
  for (const child of element.children) {
    if (child instanceof HTMLElement) {
      resolveClipPaths(child);
    }
  }
}

/**
 * Captures a rendered CardPlaceholderImage DOM element via html2canvas.
 * The element must already be in the page's React tree (with all providers).
 * @returns PNG data URL.
 */
async function captureElement(element: HTMLElement): Promise<string> {
  resolveClipPaths(element);

  const canvas = await html2canvas(element, {
    width: element.offsetWidth,
    height: element.offsetHeight,
    scale: 2,
    useCORS: true,
    backgroundColor: null,
  });
  return canvas.toDataURL("image/png");
}

/**
 * Waits two animation frames for React to commit and browser to compute styles.
 * @returns void
 */
function waitForRender(): Promise<void> {
  // oxlint-disable-next-line promise/avoid-new -- wrapping requestAnimationFrame callback API
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

export function ProxyExportDialog() {
  const [open, setOpen] = useState(false);
  const [renderMode, setRenderMode] = useState<ProxyRenderMode>("image");
  const [pageSize, setPageSize] = useState<ProxyPageSize>("a4");
  const [cutLines, setCutLines] = useState(false);
  const [watermark, setWatermark] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  // Cards currently being rendered in the hidden container for html2canvas capture
  const [renderingCard, setRenderingCard] = useState<ProxyCard | null>(null);
  const cardElementRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const handleGenerate = async () => {
    const cards = useDeckBuilderStore.getState().cards;
    if (cards.length === 0) {
      return;
    }

    const catalog = queryClient.getQueryData<CatalogResponse>(queryKeys.catalog.all);
    if (!catalog) {
      return;
    }

    setGenerating(true);
    setProgress({ current: 0, total: 0 });

    try {
      // Pre-fetch keyword styles so CardText doesn't suspend during rendering
      await queryClient.ensureQueryData(keywordStylesQueryOptions);

      const proxyCards = resolveProxyCards(cards, catalog);
      const renderedCards = new Map<string, RenderedCard>();

      if (renderMode === "image") {
        // Image mode: load and convert card images
        const imageCards = await prerenderImageCards(proxyCards, (current, total) => {
          setProgress({ current, total });
        });
        for (const [cardId, rendered] of imageCards) {
          renderedCards.set(cardId, rendered);
        }
      } else {
        // Text mode: render each unique card in the React tree, then capture with html2canvas
        const uniqueCardIds = new Set<string>();
        const uniqueCards: ProxyCard[] = [];
        for (const proxyCard of proxyCards) {
          if (!uniqueCardIds.has(proxyCard.cardId)) {
            uniqueCardIds.add(proxyCard.cardId);
            uniqueCards.push(proxyCard);
          }
        }

        for (let cardIdx = 0; cardIdx < uniqueCards.length; cardIdx++) {
          const proxyCard = uniqueCards[cardIdx];
          setProgress({ current: cardIdx + 1, total: uniqueCards.length });

          // Render the card component in the hidden container (inside the React tree)
          setRenderingCard(proxyCard);

          await waitForRender();

          // Capture with html2canvas
          const element = cardElementRef.current;
          if (element) {
            try {
              const dataUrl = await captureElement(element);
              renderedCards.set(proxyCard.cardId, { dataUrl, rotated: false });
            } catch (error) {
              console.error(`Failed to capture card "${proxyCard.name}":`, error);
            }
          }
        }

        setRenderingCard(null);
      }

      // For image mode, fall back to text mode for cards without images
      if (renderMode === "image") {
        const missingCards = proxyCards.filter((proxyCard) => !renderedCards.has(proxyCard.cardId));
        const uniqueMissing = new Map<string, ProxyCard>();
        for (const proxyCard of missingCards) {
          if (!uniqueMissing.has(proxyCard.cardId)) {
            uniqueMissing.set(proxyCard.cardId, proxyCard);
          }
        }

        for (const [, proxyCard] of uniqueMissing) {
          setRenderingCard(proxyCard);
          await waitForRender();
          const element = cardElementRef.current;
          if (element) {
            try {
              const dataUrl = await captureElement(element);
              renderedCards.set(proxyCard.cardId, { dataUrl, rotated: false });
            } catch (error) {
              console.error(`Failed to capture fallback card "${proxyCard.name}":`, error);
            }
          }
        }
        setRenderingCard(null);
      }

      await assembleProxyPdf(proxyCards, renderedCards, {
        pageSize,
        renderMode,
        cutLines,
        watermark,
      });
      setOpen(false);
    } finally {
      setGenerating(false);
      setRenderingCard(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <PrinterIcon className="size-4" />
        Proxies
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export as proxies</DialogTitle>
          <DialogDescription>
            Generate a printable PDF of proxy cards from this deck.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="proxy-render-mode">Render mode</Label>
            <Select
              value={renderMode}
              onValueChange={(value) => setRenderMode(value as ProxyRenderMode)}
            >
              <SelectTrigger id="proxy-render-mode">
                <SelectValue>
                  {(value: string) => RENDER_MODE_LABELS[value as ProxyRenderMode] ?? value}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="image">Card images</SelectItem>
                <SelectItem value="text">Text placeholders</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="proxy-page-size">Page size</Label>
            <Select value={pageSize} onValueChange={(value) => setPageSize(value as ProxyPageSize)}>
              <SelectTrigger id="proxy-page-size">
                <SelectValue>
                  {(value: string) => PAGE_SIZE_LABELS[value as ProxyPageSize] ?? value}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="a4">A4</SelectItem>
                <SelectItem value="letter">US Letter</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="proxy-cut-lines">Cut lines</Label>
            <Switch id="proxy-cut-lines" checked={cutLines} onCheckedChange={setCutLines} />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="proxy-watermark">Proxy watermark</Label>
            <Switch id="proxy-watermark" checked={watermark} onCheckedChange={setWatermark} />
          </div>
        </div>

        {/* Card preview — rendered at full size for html2canvas, scaled down visually */}
        {renderingCard && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-muted-foreground text-xs">Rendering: {renderingCard.card.name}</p>
            <Suspense
              fallback={<p className="text-muted-foreground text-xs">Loading card data…</p>}
            >
              <div
                className="overflow-hidden"
                style={{
                  width: RENDER_WIDTH_PX * PREVIEW_SCALE,
                  height: RENDER_WIDTH_PX * PREVIEW_SCALE * (88 / 63),
                }}
              >
                <div
                  ref={cardElementRef}
                  style={{
                    width: RENDER_WIDTH_PX,
                    transform: `scale(${PREVIEW_SCALE})`,
                    transformOrigin: "top left",
                  }}
                >
                  <CardPlaceholderImage
                    name={renderingCard.card.name}
                    domain={renderingCard.card.domains}
                    energy={renderingCard.card.energy}
                    might={renderingCard.card.might}
                    power={renderingCard.card.power}
                    type={renderingCard.card.type}
                    superTypes={renderingCard.card.superTypes}
                    tags={renderingCard.card.tags}
                    rulesText={renderingCard.rulesText}
                    effectText={renderingCard.effectText}
                    mightBonus={renderingCard.card.mightBonus}
                    flavorText={renderingCard.flavorText}
                  />
                </div>
              </div>
            </Suspense>
          </div>
        )}

        <DialogFooter>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                {progress.total > 0
                  ? `Rendering ${progress.current}/${progress.total}…`
                  : "Generating…"}
              </>
            ) : (
              "Generate PDF"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
