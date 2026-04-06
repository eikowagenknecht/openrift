import { CheckIcon, CopyIcon, FileTextIcon, Loader2Icon, Share2Icon } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
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
import { useExportDeck } from "@/hooks/use-decks";
import type { RegistrationFields, RegistrationPageSize } from "@/lib/registration-pdf";
import { generateRegistrationPdf } from "@/lib/registration-pdf";
import type { DeckBuilderCard } from "@/stores/deck-builder-store";
import { useDeckBuilderStore } from "@/stores/deck-builder-store";

type ExportFormat = "piltover" | "text" | "tts";
type ExportTab = ExportFormat | "registration";

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
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<ExportTab>("piltover");
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

  useEffect(() => {
    if (open && tab !== "registration") {
      exportDeck.mutate({ deckId, format: tab });
      setCopied(false);
    }
    if (!open) {
      exportDeck.reset();
      setTab("piltover");
    }
    if (open) {
      setRegDeckName(deckName ?? "");
    }
  }, [open]); // oxlint-disable-line react-hooks/exhaustive-deps -- only trigger on open/close

  const handleTabChange = (newTab: ExportTab) => {
    setTab(newTab);
    setCopied(false);
    if (newTab !== "registration") {
      exportDeck.mutate({ deckId, format: newTab });
    }
  };

  const handleCopy = async () => {
    if (!exportDeck.data?.code) {
      return;
    }
    // Use \r\n so line breaks survive iOS Safari's clipboard
    const text = exportDeck.data.code.replaceAll("\n", "\r\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleGenerateRegistration = async () => {
    const cards = cardsProp ?? useDeckBuilderStore.getState().cards;
    if (cards.length === 0) {
      return;
    }
    setGenerating(true);
    const fields: RegistrationFields = {
      deckName: regDeckName,
      firstName,
      lastName,
      riotId,
      eventDate,
      eventName,
      eventLocation,
    };
    try {
      await generateRegistrationPdf(fields, cards, registrationPageSize);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <Share2Icon className="size-4" />
          Export
        </DialogTrigger>
      )}
      <DialogContent>
        <Tabs
          defaultValue="piltover"
          value={tab}
          onValueChange={(value) => handleTabChange(value as ExportTab)}
        >
          <DialogHeader>
            <DialogTitle>Export deck</DialogTitle>
            <TabsList>
              <TabsTrigger value="piltover">Deck Code</TabsTrigger>
              <TabsTrigger value="text">Text</TabsTrigger>
              <TabsTrigger value="tts">TTS</TabsTrigger>
              <TabsTrigger value="registration">Registration</TabsTrigger>
            </TabsList>
            <DialogDescription>{FORMAT_DESCRIPTIONS[tab]}</DialogDescription>
          </DialogHeader>

          {isDirty && tab !== "registration" && (
            <p className="text-muted-foreground text-sm">
              You have unsaved changes. The exported code reflects the last saved state.
            </p>
          )}

          {tab === "registration" ? (
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
                    <Label htmlFor="reg-event-date">Event Date</Label>
                    <Input
                      id="reg-event-date"
                      type="date"
                      value={eventDate}
                      onChange={(event) => setEventDate(event.target.value)}
                    />
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
              <div className="flex min-h-[252px] min-w-0 flex-col gap-3">
                {exportDeck.isPending ? (
                  <div className="flex flex-1 items-center justify-center">
                    <Loader2Icon className="text-muted-foreground size-6 animate-spin" />
                  </div>
                ) : exportDeck.isError ? (
                  <p className="text-destructive text-sm">Failed to generate export.</p>
                ) : exportDeck.data ? (
                  <>
                    <Textarea
                      readOnly
                      value={exportDeck.data.code}
                      className="[field-sizing:fixed] font-mono text-xs break-all"
                      rows={8}
                      onClick={(event) => (event.target as HTMLTextAreaElement).select()}
                    />

                    <Button onClick={handleCopy} className="self-end">
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

                    {exportDeck.data.warnings.length > 0 && (
                      <div className="text-muted-foreground text-xs">
                        <p className="font-medium">Warnings:</p>
                        <ul className="mt-1 list-inside list-disc">
                          {exportDeck.data.warnings.map((warning) => (
                            <li key={warning}>{warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
