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

// Width used for the hidden render container (px)
const RENDER_WIDTH_PX = 504;

// SVGs that are entirely white and need recoloring to black for light-mode print.
// Other SVGs (energy, rune icons) have colored fills and should keep their original colors.
const WHITE_ONLY_SVGS = new Set(["might.svg", "exhaust.svg"]);

/**
 * Recolors white-only SVG images to black by drawing to a canvas with
 * composite operations and replacing the img src with a data URI.
 * html2canvas doesn't support CSS filter (brightness-0), so we modify the actual image data.
 * Only targets known white-only SVGs — colored SVGs (energy, rune icons) are left alone.
 */
async function recolorWhiteSvgsToBlack(element: HTMLElement): Promise<void> {
  const images = element.querySelectorAll("img");
  const promises: Promise<void>[] = [];

  for (const img of images) {
    if (!img.src || !img.complete) {
      continue;
    }
    // Only recolor known white-only SVGs
    const filename = img.src.split("/").pop() ?? "";
    if (!WHITE_ONLY_SVGS.has(filename)) {
      continue;
    }

    // oxlint-disable-next-line promise/avoid-new -- wrapping Image load callback for recoloring
    const recolor = new Promise<void>((resolve) => {
      const source = new Image();
      source.crossOrigin = "anonymous";
      source.addEventListener("load", () => {
        const canvas = document.createElement("canvas");
        canvas.width = source.naturalWidth;
        canvas.height = source.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(source, 0, 0);
          ctx.globalCompositeOperation = "source-in";
          ctx.fillStyle = "black";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          img.src = canvas.toDataURL("image/png");
        }
        resolve();
      });
      source.addEventListener("error", () => resolve());
      source.src = img.src;
    });

    promises.push(recolor);
  }

  await Promise.all(promises);
}

/**
 * Inlines computed clip-path values that html2canvas doesn't resolve from CSS classes.
 */
function inlineClipPaths(element: HTMLElement): void {
  if (!element.style.clipPath) {
    const computed = getComputedStyle(element);
    const clipPath = computed.getPropertyValue("clip-path");
    if (clipPath && clipPath !== "none") {
      element.style.clipPath = clipPath;
    }
  }

  for (const child of element.children) {
    if (child instanceof HTMLElement) {
      inlineClipPaths(child);
    }
  }
}

/**
 * Captures a rendered CardPlaceholderImage DOM element via html2canvas.
 * The element must already be in the page's React tree (with all providers).
 * @returns PNG data URL.
 */
async function captureElement(element: HTMLElement): Promise<string> {
  // Recolor white-only SVG icons to black (html2canvas doesn't support CSS filter)
  await recolorWhiteSvgsToBlack(element);
  // Inline clip-path for keyword shapes
  inlineClipPaths(element);

  const canvas = await html2canvas(element, {
    width: element.offsetWidth,
    height: element.offsetHeight,
    scale: 2,
    useCORS: true,
    backgroundColor: "#ffffff",
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

        {/* Card preview — rendered inside the React tree so all providers/hooks work */}
        {renderingCard && (
          <div className="flex flex-col items-center gap-2">
            <p className="text-muted-foreground text-xs">Rendering: {renderingCard.card.name}</p>
            <Suspense
              fallback={<p className="text-muted-foreground text-xs">Loading card data…</p>}
            >
              <div ref={cardElementRef} style={{ width: RENDER_WIDTH_PX }}>
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
                  variant="light"
                />
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
