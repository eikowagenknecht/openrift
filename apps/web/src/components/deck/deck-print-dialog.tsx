import type { CatalogResponse } from "@openrift/shared";
import { legendDisplayName } from "@openrift/shared";
import { useQueryClient } from "@tanstack/react-query";
import { FileTextIcon, Loader2Icon, PrinterIcon } from "lucide-react";
import { Suspense, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

import { CardPlaceholderImage } from "@/components/cards/card-placeholder-image";
import type { LocalDeckImageBody } from "@/components/deck/local-deck-image-body";
import { useLocalDeckImageBody } from "@/components/deck/local-deck-image-body";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogForm } from "@/components/ui/dialog-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDeckCards } from "@/hooks/use-deck-builder";
import { effectiveLanguageOrder } from "@/hooks/use-effective-language-order";
import { initQueryOptions } from "@/hooks/use-init";
import { useSession } from "@/lib/auth-session";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { sortCardsLikeSidebar } from "@/lib/deck-card-order";
import type { ProxyCard, ProxyPageSize, ProxyRenderMode, RenderedCard } from "@/lib/proxy-pdf";
import type { PublicDeckSource } from "@/lib/public-deck-source";
import { queryKeys } from "@/lib/query-keys";
import type { RegistrationFields, RegistrationPageSize } from "@/lib/registration-pdf";
import type { DeckImageOptions } from "@/lib/share-image";
import {
  deckImageFromCardsUrl,
  deckOwnerImageUrl,
  deckShareImageUrl,
  fetchImageBlob,
  fetchImageBlobFromPost,
} from "@/lib/share-image";
import { getSiteUrl } from "@/lib/site-config";
import { useDisplayStore } from "@/stores/display-store";
import { isLocalDeckId } from "@/stores/local-decks-store";

type PrintTab = "proxies" | "registration" | "sheet";

const TAB_DESCRIPTIONS: Record<PrintTab, string> = {
  proxies: "Generate a printable PDF of proxy cards from this deck.",
  registration: "Generate a printable tournament deck registration sheet.",
  sheet: "Put the deck image on one page, ready to print.",
};

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
      const converted = computed.replaceAll(/[\d.]+px/gu, (match, offset) => {
        // oxlint-disable-next-line unicorn/prefer-number-coercion -- match includes the "px" unit; Number() would yield NaN
        const px = Number.parseFloat(match);
        // Determine if this is an x or y coordinate by counting commas and spaces before this point
        // In polygon(), coordinates alternate: x y, x y, ...
        // Count how many values came before this one in the current polygon
        const before = computed.slice(computed.indexOf("(") + 1, offset);
        const valueIndex = before.split(/[\s,]+/u).filter(Boolean).length;
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
 * Loads the jsPDF-backed registration generator on first export.
 *
 * This dialog is reachable from any page that renders a deck tile, so importing
 * the generator at module scope put jsPDF plus the ~400 KB logo raster on those
 * pages' initial graph. It lives at module scope rather than inside the handler
 * because react-compiler cannot lower an `import()` expression inside a
 * component and bails on the whole file.
 * @returns The generator function.
 */
async function loadRegistrationPdfGenerator() {
  const module = await import("@/lib/registration-pdf");
  return module.generateRegistrationPdf;
}

/**
 * Loads the jsPDF-backed deck-sheet wrapper on first export, at module scope
 * and for the same reasons as `loadRegistrationPdfGenerator` above.
 * @returns The download function.
 */
async function loadImagePdfDownloader() {
  const module = await import("@/lib/image-pdf");
  return module.downloadImageAsPdf;
}

/**
 * Captures a rendered CardPlaceholderImage DOM element via html2canvas.
 * The element must already be in the page's React tree (with all providers).
 *
 * html2canvas-pro is imported here rather than at module scope: it is ~250 KB
 * and only a proxy export ever needs it, while this dialog module itself gets
 * pulled into any page that renders a deck tile.
 * @returns PNG data URL.
 */
async function captureElement(element: HTMLElement): Promise<string> {
  resolveClipPaths(element);

  const { html2canvas } = await import("html2canvas-pro");
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
  // jsPDF and the proxy layout code load on first export, not with the dialog.
  const { assembleProxyPdf, prerenderImageCards, proxyRenderKey, resolveProxyCards } =
    await import("@/lib/proxy-pdf");
  // Pre-fetch init data so CardText doesn't suspend during rendering, then
  // compose the effective language order so `preferredPrinting` picks
  // variants in the same order the rest of the UI does.
  const init = await queryClient.query({ ...initQueryOptions, staleTime: "static" });
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

/** @returns The deck name reduced to a filesystem-safe base. */
function fileNameBase(deckName: string | undefined): string {
  return (deckName ?? "deck").replaceAll(/[^\w -]+/gu, "_").trim() || "deck";
}

/**
 * The proxy tab: render options plus the generate button, and the off-screen
 * card the text renderer captures one at a time.
 * @returns The proxy panel element.
 */
function ProxyPrintPanel({
  cards,
  deckName,
  onDone,
}: {
  cards: DeckBuilderCard[];
  deckName: string;
  onDone: () => void;
}) {
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

  const handleGenerate = async () => {
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
      onDone();
    } catch (error) {
      setGenerating(false);
      setRenderingCard(null);
      throw error;
    }
    setGenerating(false);
    setRenderingCard(null);
  };

  return (
    <DialogForm onSubmit={() => void handleGenerate()}>
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

        {/* Captured card thumbnail preview */}
        {previewUrl && (
          <div className="flex justify-center">
            <img
              src={previewUrl}
              alt="Last captured card"
              className="aspect-card w-48 rounded-md"
            />
          </div>
        )}

        <Button type="submit" className="self-start" disabled={generating || cards.length === 0}>
          {generating ? (
            <>
              <Loader2Icon className="size-4 animate-spin" />
              {progress.total > 0
                ? `Rendering ${progress.current}/${progress.total}…`
                : "Generating…"}
            </>
          ) : (
            <>
              <PrinterIcon className="size-4" />
              Generate PDF
            </>
          )}
        </Button>
      </div>

      {/* Off-screen render container — in the React tree for provider access,
          but portalled out of the dialog so the popup's transform and scroll
          box can't reach it. */}
      {renderingCard &&
        createPortal(
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
                name={legendDisplayName(renderingCard.card)}
                domain={renderingCard.card.domains}
                energy={renderingCard.card.energy}
                might={renderingCard.card.might}
                power={renderingCard.card.power}
                types={renderingCard.card.types}
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
          </Suspense>,
          document.body,
        )}
    </DialogForm>
  );
}

/**
 * The registration tab: the player and event fields a tournament sheet needs,
 * plus the page size.
 * @returns The registration panel element.
 */
function RegistrationPrintPanel({
  cards,
  deckName,
}: {
  cards: DeckBuilderCard[];
  deckName: string;
}) {
  const { data: session } = useSession();
  const nameParts = (session?.user?.name ?? "").trim().split(/\s+/u);

  const [regDeckName, setRegDeckName] = useState(deckName);
  const [firstName, setFirstName] = useState(nameParts[0] ?? "");
  const [lastName, setLastName] = useState(nameParts.slice(1).join(" "));
  const [riotId, setRiotId] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventName, setEventName] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [deckDesigner, setDeckDesigner] = useState("");
  const [pageSize, setPageSize] = useState<RegistrationPageSize>("a4");
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    if (cards.length === 0) {
      return;
    }
    setGenerating(true);
    const fields: RegistrationFields = {
      deckName: regDeckName,
      deckDesigner,
      firstName,
      lastName,
      riotId,
      eventDate,
      eventName,
      eventLocation,
    };
    const generateRegistrationPdf = await loadRegistrationPdfGenerator();
    try {
      await generateRegistrationPdf(fields, cards, pageSize, getSiteUrl());
    } catch (error) {
      setGenerating(false);
      throw error;
    }
    setGenerating(false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="reg-deck-name">Deck Name</Label>
          <Input
            id="reg-deck-name"
            value={regDeckName}
            onChange={(event) => setRegDeckName(event.target.value)}
            placeholder="Untitled Deck"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reg-first-name">First Name</Label>
          <Input
            id="reg-first-name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reg-last-name">Last Name</Label>
          <Input
            id="reg-last-name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
          />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="reg-riot-id">Riot ID</Label>
          <Input
            id="reg-riot-id"
            value={riotId}
            onChange={(event) => setRiotId(event.target.value)}
            placeholder="Name#TAG"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Event Date</Label>
          <DatePicker value={eventDate || null} onChange={setEventDate} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reg-event-name">Event Name</Label>
          <Input
            id="reg-event-name"
            value={eventName}
            onChange={(event) => setEventName(event.target.value)}
          />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="reg-event-location">Event Location</Label>
          <Input
            id="reg-event-location"
            value={eventLocation}
            onChange={(event) => setEventLocation(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="reg-deck-designer">Deck Designer</Label>
          <Input
            id="reg-deck-designer"
            value={deckDesigner}
            onChange={(event) => setDeckDesigner(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="registration-page-size">Page Size</Label>
          <Select
            value={pageSize}
            onValueChange={(value) => setPageSize(value as RegistrationPageSize)}
          >
            <SelectTrigger id="registration-page-size">
              <SelectValue>
                {(value: string) => PAGE_SIZE_LABELS[value as RegistrationPageSize] ?? value}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="a4">A4</SelectItem>
              <SelectItem value="letter">US Letter</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button
        className="self-start"
        onClick={() => void handleGenerate()}
        disabled={generating || cards.length === 0}
      >
        {generating ? (
          <>
            <Loader2Icon className="size-4 animate-spin" />
            Generating…
          </>
        ) : (
          <>
            <FileTextIcon className="size-4" />
            Download PDF
          </>
        )}
      </Button>
    </div>
  );
}

/** Fetches the wide deck image the sheet wraps, from whichever route the deck is reachable on. */
function fetchSheetImage(
  deckId: string,
  publicSource: PublicDeckSource | undefined,
  options: DeckImageOptions,
  imageBody: () => LocalDeckImageBody,
): Promise<Blob> {
  if (publicSource) {
    return fetchImageBlob(
      deckShareImageUrl(getSiteUrl(), publicSource.shareToken, publicSource.imageVersion, options),
    );
  }
  if (isLocalDeckId(deckId)) {
    return fetchImageBlobFromPost(deckImageFromCardsUrl(getSiteUrl(), options), imageBody());
  }
  return fetchImageBlob(deckOwnerImageUrl(getSiteUrl(), deckId, options));
}

/**
 * The deck-sheet tab: the wide share image wrapped on a single A4 page.
 * @returns The deck sheet panel element.
 */
function DeckSheetPrintPanel({
  deckId,
  deckName,
  cards,
  publicSource,
}: {
  deckId: string;
  deckName: string;
  cards?: DeckBuilderCard[];
  publicSource?: PublicDeckSource;
}) {
  const isLocal = isLocalDeckId(deckId);
  const imageBody = useLocalDeckImageBody(deckId, deckName, cards);
  const [qr, setQr] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    // The sheet is the printable page, so it always takes the wide image at 2×.
    // It honours the QR choice, though: a printed decklist is exactly where
    // someone might not want a code on the page.
    const options = { size: "hq" as const, qr: isLocal ? false : qr };
    const blob = fetchSheetImage(deckId, publicSource, options, imageBody);
    // React Compiler can't yet lower try/finally, so reset in both paths.
    try {
      const downloadImageAsPdf = await loadImagePdfDownloader();
      await downloadImageAsPdf(await blob, `${fileNameBase(deckName)}.pdf`);
      setDownloading(false);
    } catch {
      toast.error("Couldn't prepare the PDF. Please try again.");
      setDownloading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        The wide deck image on one A4 page: the same picture that shows up when you paste a shared
        deck link into WhatsApp, Discord, or Signal.
      </p>
      {!isLocal && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="deck-sheet-include-qr"
            checked={qr}
            onCheckedChange={(checked) => setQr(checked === true)}
          />
          <label htmlFor="deck-sheet-include-qr" className="cursor-pointer text-sm">
            Include a scan code linking to the deck
          </label>
        </div>
      )}
      <Button className="self-start" onClick={() => void handleDownload()} disabled={downloading}>
        {downloading ? (
          <>
            <Loader2Icon className="size-4 animate-spin" />
            Preparing…
          </>
        ) : (
          <>
            <PrinterIcon className="size-4" />
            Download PDF
          </>
        )}
      </Button>
    </div>
  );
}

interface DeckPrintDialogProps {
  deckId: string;
  deckName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cards to print. Falls back to the live editor draft when omitted. */
  cards?: DeckBuilderCard[];
  /** Set when the deck is only reachable by share token, never owned. */
  publicSource?: PublicDeckSource;
}

/**
 * The deck's one print surface: proxy cards, a tournament registration sheet,
 * and the one-page deck sheet. Everything that ends up as a PDF lives here, so
 * the export dialog can stay machine-readable data alone.
 *
 * @returns The print dialog element.
 */
export function DeckPrintDialog({
  deckId,
  deckName,
  open,
  onOpenChange,
  cards: cardsProp,
  publicSource,
}: DeckPrintDialogProps) {
  const [tab, setTab] = useState<PrintTab>("proxies");
  // The deck-list menus pass their own cards (the draft collection isn't
  // hydrated there); the editor leaves it to the live draft. Subscribing only
  // in the editor's case keeps the list from opening one draft per row.
  const liveCards = useDeckCards(cardsProp === undefined ? deckId : "");
  const cards = cardsProp ?? liveCards;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <Tabs value={tab} onValueChange={(value) => setTab(value as PrintTab)}>
          <DialogHeader>
            <DialogTitle>Print deck</DialogTitle>
            <TabsList>
              <TabsTrigger value="proxies">Proxies</TabsTrigger>
              <TabsTrigger value="registration">Registration</TabsTrigger>
              <TabsTrigger value="sheet">Deck sheet</TabsTrigger>
            </TabsList>
            <DialogDescription>{TAB_DESCRIPTIONS[tab]}</DialogDescription>
          </DialogHeader>

          <TabsContent value="proxies" keepMounted>
            <ProxyPrintPanel cards={cards} deckName={deckName} onDone={() => onOpenChange(false)} />
          </TabsContent>
          <TabsContent value="registration" keepMounted>
            <RegistrationPrintPanel cards={cards} deckName={deckName} />
          </TabsContent>
          <TabsContent value="sheet" keepMounted>
            <DeckSheetPrintPanel
              deckId={deckId}
              deckName={deckName}
              cards={cardsProp}
              publicSource={publicSource}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
