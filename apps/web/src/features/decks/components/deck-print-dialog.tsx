import type { CatalogResponse } from "@openrift/shared/types/api/catalog";
import { legendDisplayName } from "@openrift/shared/utils";
import { useQueryClient } from "@tanstack/react-query";
import { FileTextIcon, Loader2Icon, PrinterIcon } from "lucide-react";
import { Suspense, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";

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
import { CardPlaceholderImage } from "@/features/cards/components/card-placeholder-image";
import type { LocalDeckImageBody } from "@/features/decks/components/local-deck-image-body";
import { useLocalDeckImageBody } from "@/features/decks/components/local-deck-image-body";
import { useDeckCards } from "@/features/decks/hooks/use-deck-builder";
import type { DeckBuilderCard } from "@/features/decks/lib/deck-builder-card";
import { sortCardsLikeSidebar } from "@/features/decks/lib/deck-card-order";
import { isLocalDeckId } from "@/features/decks/lib/local-deck";
import type { PublicDeckSource } from "@/features/decks/lib/public-deck-source";
import type {
  RegistrationFields,
  RegistrationPageSize,
} from "@/features/tournaments/lib/registration-pdf";
import { effectiveLanguageOrder } from "@/hooks/use-effective-language-order";
import { initQueryOptions } from "@/hooks/use-init";
import { useSession } from "@/lib/auth-session";
import type { ProxyCard, ProxyPageSize, ProxyRenderMode, RenderedCard } from "@/lib/proxy-pdf";
import { queryKeys } from "@/lib/query-keys";
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

// html2canvas supports clip-path polygon with percentages but not em/calc units; resolve via
// getComputedStyle (returns px) and convert to percentages of the element's dimensions.
function resolveClipPaths(element: HTMLElement): void {
  const inlineClip = element.style.clipPath;
  if (
    inlineClip &&
    inlineClip.includes("polygon") &&
    (inlineClip.includes("em") || inlineClip.includes("calc"))
  ) {
    const computed = getComputedStyle(element).clipPath;
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    if (width > 0 && height > 0 && computed.includes("polygon")) {
      const converted = computed.replaceAll(/[\d.]+px/gu, (match, offset) => {
        // oxlint-disable-next-line unicorn/prefer-number-coercion -- match includes the "px" unit; Number() would yield NaN
        const px = Number.parseFloat(match);
        // Coordinates alternate x y, x y, ... within the polygon; count values before this one.
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

// Dynamic import at module scope: react-compiler can't lower an `import()` inside a component
// and bails on the whole file, and eager import would put jsPDF on every deck tile's page.
async function loadRegistrationPdfGenerator() {
  const module = await import("@/features/tournaments/lib/registration-pdf");
  return module.generateRegistrationPdf;
}

// Module scope for the same reasons as loadRegistrationPdfGenerator above.
async function loadImagePdfDownloader() {
  const module = await import("@/lib/image-pdf");
  return module.downloadImageAsPdf;
}

// The element must already be in the page's React tree (with all providers).
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

// Waits two animation frames for React to commit and the browser to compute styles.
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

// Lives at module scope: react-compiler bails on "value blocks within try/catch"
// when this mixed async/branch/try-catch control flow sits inside the component.
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
  const { assembleProxyPdf, prerenderImageCards, proxyRenderKey, resolveProxyCards } =
    await import("@/lib/proxy-pdf");
  // Pre-fetch so CardText doesn't suspend during rendering.
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

    for (const [cardIdx, proxyCard] of uniqueCards.entries()) {
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

function fileNameBase(deckName: string | undefined): string {
  return (deckName ?? "deck").replaceAll(/[^\w -]+/gu, "_").trim() || "deck";
}

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
  const [renderingCard, setRenderingCard] = useState<ProxyCard | null>(null);
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

      {/* Portalled out of the dialog so the popup's transform/scroll box can't clip it. */}
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
  cards?: DeckBuilderCard[];
  publicSource?: PublicDeckSource;
}

export function DeckPrintDialog({
  deckId,
  deckName,
  open,
  onOpenChange,
  cards: cardsProp,
  publicSource,
}: DeckPrintDialogProps) {
  const [tab, setTab] = useState<PrintTab>("proxies");
  // Subscribing only when cardsProp is omitted keeps the deck-list menus from
  // opening one draft per row; the editor still gets the live draft.
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
