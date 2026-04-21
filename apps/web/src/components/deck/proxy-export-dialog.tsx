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
import { useDeckCards } from "@/hooks/use-deck-builder";
import { effectiveLanguageOrder } from "@/hooks/use-effective-language-order";
import { initQueryOptions } from "@/hooks/use-init";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { sortCardsLikeSidebar } from "@/lib/deck-card-order";
import type { ProxyCard, ProxyPageSize, ProxyRenderMode, RenderedCard } from "@/lib/proxy-pdf";
import {
  assembleProxyPdf,
  prerenderImageCards,
  proxyRenderKey,
  resolveProxyCards,
} from "@/lib/proxy-pdf";
import { queryKeys } from "@/lib/query-keys";
import { useDisplayStore } from "@/stores/display-store";

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

interface GenerateProxyPdfParams {
  cards: DeckBuilderCard[];
  catalog: CatalogResponse;
  languages: string[];
  renderMode: ProxyRenderMode;
  pageSize: ProxyPageSize;
  cutLines: boolean;
  watermark: boolean;
  deckName: string | undefined;
  queryClient: ReturnType<typeof useQueryClient>;
  cardElementRef: React.RefObject<HTMLDivElement | null>;
  setProgress: (progress: { current: number; total: number }) => void;
  setRenderingCard: (card: ProxyCard | null) => void;
  setPreviewUrl: (url: string | null) => void;
}

/**
 * Runs the full "deck → rendered cards → assembled PDF" pipeline.
 *
 * Lives at module scope (not inside the component) so react-compiler doesn't
 * try to lower the mixed async/branch/try-catch control flow — the compiler
 * bails out on "value blocks within try/catch" otherwise.
 * @param params Generation inputs and UI state setters.
 * @returns Resolves once the PDF has been assembled and downloaded.
 */
async function generateProxyPdf({
  cards,
  catalog,
  languages,
  renderMode,
  pageSize,
  cutLines,
  watermark,
  deckName,
  queryClient,
  cardElementRef,
  setProgress,
  setRenderingCard,
  setPreviewUrl,
}: GenerateProxyPdfParams): Promise<void> {
  // Pre-fetch init data so CardText doesn't suspend during rendering, then
  // compose the effective language order so `preferredPrinting` picks
  // variants in the same order the rest of the UI does.
  const init = await queryClient.ensureQueryData(initQueryOptions);
  const languageRows = (init.enums.languages ?? []) as { slug: string; sortOrder: number }[];
  const languageOrder = effectiveLanguageOrder(languages, languageRows);
  const zoneRows = (init.enums.deckZones ?? []) as { slug: string; sortOrder: number }[];
  const zoneOrder = zoneRows
    .toSorted((a, b) => a.sortOrder - b.sortOrder)
    .map((zone) => zone.slug as DeckBuilderCard["zone"]);

  const orderedCards = sortCardsLikeSidebar(cards, zoneOrder);
  const proxyCards = resolveProxyCards(orderedCards, catalog, languageOrder);
  const renderedCards = new Map<string, RenderedCard>();

  if (renderMode === "image") {
    const imageCards = await prerenderImageCards(proxyCards, (current, total) => {
      setProgress({ current, total });
    });
    imageCards.forEach((rendered, key) => {
      renderedCards.set(key, rendered);
    });
  } else {
    const seenKeys = new Set<string>();
    const uniqueCards: ProxyCard[] = [];
    for (const proxyCard of proxyCards) {
      const key = proxyRenderKey(proxyCard);
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueCards.push(proxyCard);
      }
    }

    for (let cardIdx = 0; cardIdx < uniqueCards.length; cardIdx++) {
      const proxyCard = uniqueCards[cardIdx];
      setProgress({ current: cardIdx + 1, total: uniqueCards.length });

      setRenderingCard(proxyCard);
      await waitForRender();

      const element = cardElementRef.current;
      if (element) {
        try {
          const dataUrl = await captureElement(element);
          renderedCards.set(proxyRenderKey(proxyCard), { dataUrl, rotated: false });
          setPreviewUrl(dataUrl);
        } catch (error) {
          console.error(`Failed to capture card "${proxyCard.name}":`, error);
        }
      }
    }

    setRenderingCard(null);
  }

  if (renderMode === "image") {
    const missingCards = proxyCards.filter(
      (proxyCard) => !renderedCards.has(proxyRenderKey(proxyCard)),
    );
    const uniqueMissing = new Map<string, ProxyCard>();
    for (const proxyCard of missingCards) {
      const key = proxyRenderKey(proxyCard);
      if (!uniqueMissing.has(key)) {
        uniqueMissing.set(key, proxyCard);
      }
    }

    for (const proxyCard of uniqueMissing.values()) {
      setRenderingCard(proxyCard);
      await waitForRender();
      const element = cardElementRef.current;
      if (element) {
        try {
          const dataUrl = await captureElement(element);
          renderedCards.set(proxyRenderKey(proxyCard), { dataUrl, rotated: false });
          setPreviewUrl(dataUrl);
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
    deckName,
  });
}

interface ProxyExportDialogProps {
  /** When provided, the dialog is controlled externally (no built-in trigger). */
  open?: boolean;
  /** Called when the dialog wants to change open state. Required when `open` is provided. */
  onOpenChange?: (open: boolean) => void;
  /**
   * Cards to export. Either this or `deckId` must be provided; if both, `cards` wins.
   */
  cards?: DeckBuilderCard[];
  /**
   * Deck id to pull the current draft cards from. Used when `cards` isn't passed.
   */
  deckId?: string;
  /** Deck name used to derive the PDF filename. */
  deckName?: string;
}

/**
 * Dialog for exporting a deck as a printable proxy PDF.
 * @returns The proxy export dialog element.
 */
export function ProxyExportDialog({
  open: controlledOpen,
  onOpenChange,
  cards: cardsProp,
  deckId,
  deckName,
}: ProxyExportDialogProps = {}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (value: boolean) => {
    if (value) {
      setPreviewUrl(null);
    }
    if (isControlled) {
      onOpenChange?.(value);
    } else {
      setInternalOpen(value);
    }
  };
  const [renderMode, setRenderMode] = useState<ProxyRenderMode>("image");
  const [pageSize, setPageSize] = useState<ProxyPageSize>("a4");
  const [cutLines, setCutLines] = useState(false);
  const [watermark, setWatermark] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  // Card currently being rendered off-screen for html2canvas capture
  const [renderingCard, setRenderingCard] = useState<ProxyCard | null>(null);
  // Last captured card image shown as a thumbnail preview
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const cardElementRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const languages = useDisplayStore((state) => state.languages);
  // Hook must run unconditionally; when deckId is absent we still call it
  // with an empty string and end up reading an empty collection.
  const liveCards = useDeckCards(deckId ?? "");

  const handleGenerate = async () => {
    const cards = cardsProp ?? liveCards;
    if (cards.length === 0) {
      return;
    }

    const catalog = queryClient.getQueryData<CatalogResponse>(queryKeys.catalog.all);
    if (!catalog) {
      return;
    }

    setGenerating(true);
    setProgress({ current: 0, total: 0 });
    setPreviewUrl(null);

    try {
      await generateProxyPdf({
        cards,
        catalog,
        languages,
        renderMode,
        pageSize,
        cutLines,
        watermark,
        deckName,
        queryClient,
        cardElementRef,
        setProgress,
        setRenderingCard,
        setPreviewUrl,
      });
      setOpen(false);
    } catch (error) {
      setGenerating(false);
      setRenderingCard(null);
      throw error;
    }
    setGenerating(false);
    setRenderingCard(null);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger render={<Button variant="ghost" size="sm" />}>
          <PrinterIcon className="size-4" />
          Proxies
        </DialogTrigger>
      )}
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

        {/* Captured card thumbnail preview */}
        {previewUrl && (
          <div className="flex justify-center">
            <img src={previewUrl} alt="Last captured card" className="aspect-card w-48 rounded" />
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

      {/* Off-screen render container — in the React tree for provider access, but not in the dialog layout */}
      {renderingCard && (
        <Suspense fallback={null}>
          <div
            ref={cardElementRef}
            style={{
              position: "fixed",
              left: -9999,
              top: 0,
              width: RENDER_WIDTH_PX,
              pointerEvents: "none",
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
              rarity={renderingCard.rarity}
              publicCode={renderingCard.publicCode}
              artist={renderingCard.artist}
            />
          </div>
        </Suspense>
      )}
    </Dialog>
  );
}
