import type { DeckExportResponse } from "@openrift/shared";
import {
  CheckIcon,
  CopyIcon,
  FileTextIcon,
  ImageDownIcon,
  Loader2Icon,
  PrinterIcon,
  Share2Icon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageTopBarButton } from "@/components/layout/page-top-bar";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useDeckCards } from "@/hooks/use-deck-builder";
import { useEncodeDeckCards, useExportDeck } from "@/hooks/use-decks";
import { useSession } from "@/lib/auth-session";
import type { DeckBuilderCard } from "@/lib/deck-builder-card";
import { toEncodeDeckCards } from "@/lib/deck-encode-input";
import { downloadImageAsPdf } from "@/lib/image-pdf";
import type { RegistrationFields, RegistrationPageSize } from "@/lib/registration-pdf";
import { generateRegistrationPdf } from "@/lib/registration-pdf";
import {
  deckImageFromCardsUrl,
  deckOwnerImageUrl,
  downloadImageFromPost,
  downloadImageFromUrl,
  fetchImageBlob,
  fetchImageBlobFromPost,
} from "@/lib/share-image";
import { getSiteUrl } from "@/lib/site-config";
import { isLocalDeckId, useLocalDecksStore } from "@/stores/local-decks-store";

type ExportFormat = "piltover" | "text" | "tts";
type ExportTab = ExportFormat | "registration" | "image";
interface FormatState {
  data?: DeckExportResponse;
  loading?: boolean;
  error?: boolean;
}

const FORMAT_DESCRIPTIONS: Record<ExportTab, React.ReactNode> = {
  piltover: (
    <>
      A compact code that can be imported into{" "}
      <a
        href="https://piltoverarchive.com"
        target="_blank"
        rel="noreferrer"
        className="text-foreground underline"
      >
        Piltover Archive
      </a>
      .
    </>
  ),
  text: (
    <>
      A human-readable list grouped by zone. Used by many deck builders, including{" "}
      <a
        href="https://piltoverarchive.com"
        target="_blank"
        rel="noreferrer"
        className="text-foreground underline"
      >
        Piltover Archive
      </a>{" "}
      and{" "}
      <a
        href="https://tcg-arena.fr/decks"
        target="_blank"
        rel="noreferrer"
        className="text-foreground underline"
      >
        TCG Arena
      </a>
      .
    </>
  ),
  tts: (
    <>
      Space-separated short codes for the{" "}
      <a
        href="https://steamcommunity.com/sharedfiles/filedetails/?id=3606647746"
        target="_blank"
        rel="noreferrer"
        className="text-foreground underline"
      >
        Tabletop Simulator mod
      </a>
      .
    </>
  ),
  registration: "Generate a printable tournament deck registration sheet.",
  image: "A shareable deck image for WhatsApp, Discord, or printing.",
};

const PAGE_SIZE_LABELS: Record<RegistrationPageSize, string> = {
  a4: "A4",
  letter: "US Letter",
};

interface DeckExportDialogProps {
  deckId: string;
  deckName?: string;
  isDirty: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Cards for registration sheet. Falls back to the deck builder store when omitted. */
  cards?: DeckBuilderCard[];
}

export function DeckExportDialog({
  deckId,
  deckName,
  isDirty,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  cards: cardsProp,
}: DeckExportDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;
  const isControlled = controlledOpen !== undefined;
  const exportDeck = useExportDeck();
  // A browser-local deck (ADR-035) has no server row to export by id; encode its
  // cards through the public endpoint instead. Same codecs, same output.
  const encodeDeck = useEncodeDeckCards();
  const isLocal = isLocalDeckId(deckId);
  const { data: session } = useSession();
  const liveCards = useDeckCards(deckId);
  // A browser-local deck holds its format client-side (no server row to read it
  // from); the from-cards image render needs it for the title's format label.
  const localDeckFormat = useLocalDecksStore((state) =>
    isLocal ? state.decks[deckId]?.format : undefined,
  );
  const [copied, setCopied] = useState(false);
  const [downloadingImage, setDownloadingImage] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [tab, setTab] = useState<ExportTab>("text");
  const [formats, setFormats] = useState<Partial<Record<ExportFormat, FormatState>>>({});
  const [registrationPageSize, setRegistrationPageSize] = useState<RegistrationPageSize>("a4");
  const [generating, setGenerating] = useState(false);

  // Registration form fields
  const [regDeckName, setRegDeckName] = useState(deckName ?? "");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [riotId, setRiotId] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventName, setEventName] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [deckDesigner, setDeckDesigner] = useState("");

  useEffect(() => {
    if (!open) {
      exportDeck.reset();
      encodeDeck.reset();
      setTab("text");
      setFormats({});
      setCopied(false);
      setDownloadingImage(false);
      return;
    }
    setRegDeckName(deckName ?? "");
    // Prefill first/last name from user profile if not already filled
    if (!firstName && !lastName && session?.user?.name) {
      const parts = session.user.name.trim().split(/\s+/u);
      setFirstName(parts[0] ?? "");
      setLastName(parts.slice(1).join(" "));
    }
  }, [open]); // oxlint-disable-line react-hooks/exhaustive-deps -- only trigger on open/close

  useEffect(() => {
    if (!open || tab === "registration" || tab === "image") {
      return;
    }
    const current = formats[tab];
    if (current?.data || current?.loading) {
      return;
    }
    setFormats((prev) => ({ ...prev, [tab]: { loading: true } }));
    const onSuccess = (data: DeckExportResponse) => {
      setFormats((prev) => ({ ...prev, [tab]: { data } }));
    };
    const onError = () => {
      setFormats((prev) => ({ ...prev, [tab]: { error: true } }));
    };
    if (isLocal) {
      // Use the passed-in cards when available (the list menu, where the draft
      // collection isn't hydrated); fall back to the live editor draft.
      encodeDeck.mutate(
        { format: tab, cards: toEncodeDeckCards(cardsProp ?? liveCards) },
        { onSuccess, onError },
      );
    } else {
      exportDeck.mutate({ deckId, format: tab }, { onSuccess, onError });
    }
  }, [open, tab]); // oxlint-disable-line react-hooks/exhaustive-deps -- formats read via closure, not reactively

  const handleTabChange = (newTab: ExportTab) => {
    setTab(newTab);
    setCopied(false);
  };

  const currentFormat = tab === "registration" || tab === "image" ? {} : (formats[tab] ?? {});
  const currentData = currentFormat.data;
  const currentLoading = currentFormat.loading ?? false;
  const currentError = currentFormat.error ?? false;

  const handleCopy = async () => {
    if (!currentData?.code) {
      return;
    }
    // Use \r\n so line breaks survive iOS Safari's clipboard
    const text = currentData.code.replaceAll("\n", "\r\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerateRegistration = async () => {
    const cards = cardsProp ?? liveCards;
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
    try {
      await generateRegistrationPdf(fields, cards, registrationPageSize, getSiteUrl());
    } catch (error) {
      setGenerating(false);
      throw error;
    }
    setGenerating(false);
  };

  // Local decks have no server row, so the image renders from the current cards
  // (the server enriches names/art/energy from the posted ids); saved decks
  // resolve by id through the owner-authenticated route.
  const localImageBody = () => ({
    deckName: deckName ?? "",
    format: localDeckFormat,
    ownerName: session?.user?.name ?? "",
    cards: toEncodeDeckCards(cardsProp ?? liveCards),
  });

  const imageFileName = () => (deckName ?? "deck").replaceAll(/[^\w -]+/gu, "_").trim() || "deck";

  const handleDownloadImage = async () => {
    setDownloadingImage(true);
    const safeName = imageFileName();
    const download = isLocal
      ? downloadImageFromPost(
          deckImageFromCardsUrl(getSiteUrl(), "hq"),
          localImageBody(),
          `${safeName}.png`,
        )
      : downloadImageFromUrl(deckOwnerImageUrl(getSiteUrl(), deckId, "hq"), `${safeName}.png`);
    // React Compiler can't yet lower try/finally, so reset in both paths.
    try {
      await download;
      setDownloadingImage(false);
    } catch {
      toast.error("Couldn't prepare the image. Please try again.");
      setDownloadingImage(false);
    }
  };

  const handleDownloadImagePdf = async () => {
    setDownloadingPdf(true);
    const safeName = imageFileName();
    const blob = isLocal
      ? fetchImageBlobFromPost(deckImageFromCardsUrl(getSiteUrl(), "hq"), localImageBody())
      : fetchImageBlob(deckOwnerImageUrl(getSiteUrl(), deckId, "hq"));
    // React Compiler can't yet lower try/finally, so reset in both paths.
    try {
      await downloadImageAsPdf(await blob, `${safeName}.pdf`);
      setDownloadingPdf(false);
    } catch {
      toast.error("Couldn't prepare the PDF. Please try again.");
      setDownloadingPdf(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger render={<PageTopBarButton />}>
          <Share2Icon className="size-4" />
          Export
        </DialogTrigger>
      )}
      <DialogContent>
        <Tabs
          defaultValue="text"
          value={tab}
          onValueChange={(value) => handleTabChange(value as ExportTab)}
        >
          <DialogHeader>
            <DialogTitle>Export deck</DialogTitle>
            <TabsList>
              <TabsTrigger value="text">Text</TabsTrigger>
              <TabsTrigger value="piltover">Deck Code</TabsTrigger>
              <TabsTrigger value="tts">TTS</TabsTrigger>
              <TabsTrigger value="image">Image</TabsTrigger>
              <TabsTrigger value="registration">Registration</TabsTrigger>
            </TabsList>
            <DialogDescription>{FORMAT_DESCRIPTIONS[tab]}</DialogDescription>
          </DialogHeader>

          {isDirty && tab !== "registration" && tab !== "image" && (
            <p className="text-muted-foreground text-sm">
              You have unsaved changes. The exported code reflects the last saved state.
            </p>
          )}

          {isDirty && tab === "image" && !isLocal && (
            <p className="text-muted-foreground text-sm">
              You have unsaved changes. The image reflects the last saved state.
            </p>
          )}

          {tab === "image" ? (
            <TabsContent value="image">
              <div className="flex flex-col gap-3">
                <p className="text-muted-foreground text-sm">
                  This is the same preview that appears when you paste a shared deck link into
                  WhatsApp, Discord, or Signal. The PDF puts it on one A4 page for printing.
                </p>
                <div className="flex gap-2">
                  <Button onClick={handleDownloadImage} disabled={downloadingImage}>
                    {downloadingImage ? (
                      <>
                        <Loader2Icon className="size-4 animate-spin" />
                        Preparing…
                      </>
                    ) : (
                      <>
                        <ImageDownIcon className="size-4" />
                        Download image
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleDownloadImagePdf}
                    disabled={downloadingPdf}
                  >
                    {downloadingPdf ? (
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
              </div>
            </TabsContent>
          ) : tab === "registration" ? (
            <TabsContent value="registration">
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
                      value={registrationPageSize}
                      onValueChange={(value) =>
                        setRegistrationPageSize(value as RegistrationPageSize)
                      }
                    >
                      <SelectTrigger id="registration-page-size">
                        <SelectValue>
                          {(value: string) =>
                            PAGE_SIZE_LABELS[value as RegistrationPageSize] ?? value
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="a4">A4</SelectItem>
                        <SelectItem value="letter">US Letter</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button onClick={handleGenerateRegistration} disabled={generating}>
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
            </TabsContent>
          ) : (
            <TabsContent value={tab}>
              <div className="flex min-w-0 flex-col gap-3">
                <Textarea
                  readOnly
                  value={currentData?.code ?? ""}
                  placeholder={currentError ? "Failed to generate export." : ""}
                  className="field-sizing-fixed font-mono text-xs break-all"
                  rows={8}
                  onClick={(event) => (event.target as HTMLTextAreaElement).select()}
                />

                <div className="flex items-center gap-2 self-end">
                  {currentLoading && (
                    <Loader2Icon className="text-muted-foreground size-4 animate-spin" />
                  )}
                  <Button onClick={handleCopy} disabled={!currentData}>
                    {copied ? (
                      <>
                        <CheckIcon className="size-4" />
                        Copied
                      </>
                    ) : (
                      <>
                        <CopyIcon className="size-4" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>

                {currentData && currentData.warnings.length > 0 && (
                  <div className="text-muted-foreground text-xs">
                    <p className="font-medium">Warnings:</p>
                    <ul className="mt-1 list-inside list-disc">
                      {currentData.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
