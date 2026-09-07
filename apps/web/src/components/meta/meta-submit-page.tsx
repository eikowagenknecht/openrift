import type { MetaEventSummary, MetaSubmissionResult, Printing } from "@openrift/shared";
import { enumLabel, formatDay } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { CheckCircle2Icon, TriangleAlertIcon } from "lucide-react";
import { useDeferredValue, useState } from "react";

import {
  PageTopBar,
  PageTopBarActions,
  PageTopBarBack,
  PageTopBarButton,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useCards } from "@/hooks/use-cards";
import { useDeckFormatList } from "@/hooks/use-enums";
import { useMetaEvents } from "@/hooks/use-meta";
import type { MetaSubmissionOutcome } from "@/hooks/use-meta-submissions";
import { useSubmitMetaDeck } from "@/hooks/use-meta-submissions";
import { formatRank, formatRecord } from "@/lib/meta-format";
import {
  metaSubmissionCompletenessLabels,
  metaSubmissionFormTitles,
} from "@/lib/meta-submission-copy";
import type {
  MetaSubmissionDraft,
  MetaSubmissionParsedList,
  MetaSubmissionPrefill,
} from "@/lib/meta-submission-form";
import {
  buildMetaSubmissionInput,
  metaSubmissionDraftFromPrefill,
  metaSubmissionLegendMismatch,
  parseMetaSubmissionList,
  validateMetaSubmissionDraft,
} from "@/lib/meta-submission-form";
import { cn, PAGE_WIDTH } from "@/lib/utils";

const DECK_PLACEHOLDER = `Legend:
1 Emperor of the Sands

Champion:
1 Azir, Sovereign

MainDeck:
3 Arise!
3 Soul Sword

Battlefields:
1 Seat of Power`;

function plural(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

function joinMissing(parts: readonly string[]): string {
  if (parts.length <= 1) {
    return parts.join("");
  }
  return `${parts.slice(0, -1).join(", ")} or ${parts.at(-1)}`;
}

function partialListSentence(parsed: MetaSubmissionParsedList): string {
  const missing: string[] = [];
  if (parsed.legend === null) {
    missing.push("legend");
  }
  if (parsed.zones.battlefield === 0) {
    missing.push("battlefields");
  }
  if (parsed.zones.runes === 0) {
    missing.push("runes");
  }
  const tail =
    missing.length === 1 ? "Paste it too if you have it." : "Paste them too if you have them.";
  return `No ${joinMissing(missing)} in the list, so it goes in as a partial list. ${tail}`;
}

function parsedList(text: string, allPrintings: Printing[]): MetaSubmissionParsedList | null {
  return text.trim() === "" ? null : parseMetaSubmissionList(text, allPrintings);
}

function finishLabel(rank: number | undefined, rankIsTier: boolean | undefined): string | null {
  if (rank === undefined) {
    return null;
  }
  return rankIsTier === true ? formatRank(rank, true) : `#${rank}`;
}

function eventFacts(event: MetaEventSummary, formatLabel: string): string {
  const facts = [formatDay(event.eventDate), formatLabel];
  if (event.playerCount !== null) {
    facts.push(plural(event.playerCount, "player"));
  }
  return facts.join(" · ");
}

function LegendCheck({
  parsed,
  prefill,
}: {
  parsed: MetaSubmissionParsedList;
  prefill: MetaSubmissionPrefill;
}) {
  if (prefill.legendCardId === undefined || parsed.legend === null) {
    return null;
  }
  if (!metaSubmissionLegendMismatch(parsed, prefill.legendCardId)) {
    return <p className="text-muted-foreground text-sm">Legend matches the standings.</p>;
  }
  return (
    <Alert variant="info">
      <AlertTitle>
        This list&apos;s legend is {parsed.legend.cardName}, but the standings have{" "}
        {prefill.legendName}
      </AlertTitle>
      <AlertDescription>
        Check you opened the right row. If the list is right, send it and the reviewer sees both.
      </AlertDescription>
    </Alert>
  );
}

function ListReadback({
  parsed,
  prefill,
}: {
  parsed: MetaSubmissionParsedList;
  prefill: MetaSubmissionPrefill;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={parsed.listStatus === "full" ? "success" : "muted"}>
          {metaSubmissionCompletenessLabels[parsed.listStatus]}
        </Badge>
        <span className="text-muted-foreground text-sm">
          {parsed.zones.main} main · {plural(parsed.zones.battlefield, "battlefield")} ·{" "}
          {plural(parsed.zones.runes, "rune")}
        </span>
      </div>

      {parsed.listStatus === "partial" && (
        <p className="text-muted-foreground text-sm">{partialListSentence(parsed)}</p>
      )}

      <LegendCheck parsed={parsed} prefill={prefill} />

      {parsed.reinterpreted.length > 0 && (
        <Alert variant="info">
          <AlertTitle>Check these two are the same card</AlertTitle>
          <AlertDescription>
            <ul className="list-inside list-disc">
              {parsed.reinterpreted.map((row) => (
                <li key={row.source}>
                  {row.source} → {row.matched}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {parsed.unmatched.length > 0 && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>
            {parsed.unmatched.length === 1
              ? "One line doesn't match a card we know"
              : `${parsed.unmatched.length} lines don't match a card we know`}
          </AlertTitle>
          <AlertDescription>
            <ul className="list-inside list-disc">
              {parsed.unmatched.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
            <p>
              Fix the spelling if it&apos;s a typo. If the card really is missing from our
              catalogue, send it anyway and say so in the note.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {parsed.warnings.length > 0 && (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>Some lines were skipped</AlertTitle>
          <AlertDescription>
            <ul className="list-inside list-disc">
              {parsed.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function SubmissionSent({
  result,
  eventSlug,
  onSendAnother,
}: {
  result: MetaSubmissionResult;
  eventSlug?: string;
  onSendAnother: () => void;
}) {
  const unresolved = result.unresolvedNames;
  const showRetry = eventSlug === undefined || unresolved.length > 0;
  return (
    <div className="flex flex-col gap-4">
      {unresolved.length === 0 ? (
        <Alert>
          <CheckCircle2Icon />
          <AlertTitle>Your decklist is with us</AlertTitle>
          <AlertDescription>
            Someone reads every list by hand before it goes up, so this can take a while. You can
            follow it on your own page.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="warning">
          <TriangleAlertIcon />
          <AlertTitle>
            {unresolved.length === 1
              ? "We couldn't place one of your cards"
              : `We couldn't place ${unresolved.length} of your cards`}
          </AlertTitle>
          <AlertDescription>
            <ul className="list-inside list-disc">
              {unresolved.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
            <p>
              Send the list again with the spelling fixed, or say in the note what the card was.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        {eventSlug !== undefined && (
          <Button render={<Link to="/meta/$slug" params={{ slug: eventSlug }} />}>
            Back to the standings
          </Button>
        )}
        <Button
          variant={eventSlug === undefined ? "default" : "outline"}
          render={<Link to="/meta/submissions" />}
        >
          Your contributions
        </Button>
        {showRetry && (
          <Button variant="outline" onClick={onSendAnother}>
            {unresolved.length === 0 ? "Send another" : "Fix the list and send again"}
          </Button>
        )}
      </div>
    </div>
  );
}

export function MetaSubmitPage({
  slug,
  prefill,
}: {
  slug?: string;
  prefill?: MetaSubmissionPrefill;
}) {
  const { data: eventsData } = useMetaEvents();
  const { allPrintings } = useCards();
  const { formats, labels: formatLabels } = useDeckFormatList();
  const submit = useSubmitMetaDeck();

  const events = eventsData.events;
  const eventFromSlug = slug === undefined ? undefined : events.find((row) => row.slug === slug);
  const row = prefill ?? {};

  const [draft, setDraft] = useState<MetaSubmissionDraft>(() =>
    metaSubmissionDraftFromPrefill(row),
  );
  const [selectedEventId, setSelectedEventId] = useState<string>(eventFromSlug?.id ?? "");
  const [proposing, setProposing] = useState(eventFromSlug === undefined && events.length === 0);
  const [noteOpen, setNoteOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [result, setResult] = useState<MetaSubmissionResult | null>(null);

  const deferredDeckText = useDeferredValue(draft.deckText);
  const parsed = parsedList(deferredDeckText, allPrintings);

  const lockedToEvent = eventFromSlug !== undefined;
  const fromRow = lockedToEvent && row.playerName !== undefined && row.rank !== undefined;
  // A proposed tournament is one the archive has never seen, so there is
  // nothing to complete or correct whatever link got the sender here.
  const kind = proposing ? "new_list" : draft.kind;
  const startedFromArchivedList = draft.kind !== "new_list" && (row.deckText ?? "") !== "";
  const noteExpanded = noteOpen || kind === "correction";

  function set<TKey extends keyof MetaSubmissionDraft>(
    key: TKey,
    value: MetaSubmissionDraft[TKey],
  ) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function applyOutcome(outcome: MetaSubmissionOutcome) {
    if (!outcome.ok) {
      setFormError(outcome.message);
      return;
    }
    setResult(outcome.result);
  }

  async function handleSubmit() {
    const problem = validateMetaSubmissionDraft(draft, {
      proposing,
      cardCount: parsed?.cards.length ?? 0,
    });
    if (problem) {
      setFormError(problem);
      return;
    }
    if (!proposing && selectedEventId === "") {
      setFormError("Pick the tournament this deck came from.");
      return;
    }
    if (parsed === null) {
      setFormError("Paste the decklist before sending.");
      return;
    }

    const target = proposing ? null : { metaEventId: selectedEventId };
    const input = buildMetaSubmissionInput(draft, parsed, target);
    setFormError("");
    try {
      applyOutcome(await submit.mutateAsync(input));
    } catch {
      /* Reported by the global mutation error toast. */
    }
  }

  function handleSendAnother() {
    setResult(null);
  }

  const eventItems: Record<string, string> = {};
  for (const event of events) {
    eventItems[event.id] = `${event.name} · ${formatDay(event.eventDate)}`;
  }

  const formatItems: Record<string, string> = {};
  for (const format of formats) {
    formatItems[format.slug] = format.label;
  }

  const record = formatRecord(row.wins ?? null, row.losses ?? null, row.draws ?? null);
  const finish = finishLabel(row.rank, row.rankIsTier);
  const cancelSlug = lockedToEvent ? slug : undefined;
  const deckHint = startedFromArchivedList
    ? "This is the list the archive has. Edit it and send the whole thing back."
    : "A deck code, a TTS export, or one card per line.";

  return (
    <>
      <PageTopBarSticky width="capped">
        <PageTopBar>
          {cancelSlug === undefined ? (
            <PageTopBarBack to="/meta" />
          ) : (
            <PageTopBarBack to="/meta/$slug" params={{ slug: cancelSlug }} />
          )}
          <PageTopBarTitle>{metaSubmissionFormTitles[kind]}</PageTopBarTitle>
          <PageTopBarActions>
            <PageTopBarButton render={<Link to="/meta/submissions" />}>
              Your contributions
            </PageTopBarButton>
          </PageTopBarActions>
        </PageTopBar>
      </PageTopBarSticky>

      <div className={cn(PAGE_WIDTH.capped, "space-y-4 px-4 pt-3 pb-12")}>
        {result ? (
          <SubmissionSent
            result={result}
            eventSlug={fromRow ? cancelSlug : undefined}
            onSendAnother={handleSendAnother}
          />
        ) : (
          <>
            {fromRow && eventFromSlug ? (
              <Card>
                <CardHeader>
                  <CardTitle>{eventFromSlug.name}</CardTitle>
                  <CardDescription>
                    {eventFacts(eventFromSlug, enumLabel(formatLabels, eventFromSlug.format))}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{row.playerName}</span>
                    {finish !== null && <Badge variant="outline">{finish}</Badge>}
                    {record !== null && (
                      <span className="text-muted-foreground tabular-nums">{record}</span>
                    )}
                    {row.legendName !== undefined && (
                      <span className="text-muted-foreground">Legend {row.legendName}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {!fromRow && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>The tournament</CardTitle>
                    <CardDescription>
                      {lockedToEvent
                        ? "Where this deck was played."
                        : "Pick the tournament this deck came from, or tell us about one we don't have."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FieldGroup>
                      {lockedToEvent && eventFromSlug ? (
                        <Field>
                          <p className="font-medium">{eventFromSlug.name}</p>
                          <FieldDescription>
                            {eventFacts(
                              eventFromSlug,
                              enumLabel(formatLabels, eventFromSlug.format),
                            )}
                          </FieldDescription>
                        </Field>
                      ) : null}

                      {!lockedToEvent && !proposing ? (
                        <Field>
                          <FieldLabel htmlFor="meta-submit-event">Tournament</FieldLabel>
                          <Select
                            items={eventItems}
                            value={selectedEventId}
                            onValueChange={(value) => setSelectedEventId((value as string) ?? "")}
                          >
                            <SelectTrigger id="meta-submit-event" className="w-full">
                              <SelectValue placeholder="Pick a tournament" />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(eventItems).map(([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FieldDescription>
                            <Button
                              type="button"
                              variant="link-muted"
                              size="sm"
                              className="h-auto p-0"
                              onClick={() => setProposing(true)}
                            >
                              We don&apos;t have your tournament? Tell us about it
                            </Button>
                          </FieldDescription>
                        </Field>
                      ) : null}

                      {!lockedToEvent && proposing ? (
                        <>
                          <Field>
                            <FieldLabel htmlFor="meta-submit-event-name">
                              Tournament name
                            </FieldLabel>
                            <Input
                              id="meta-submit-event-name"
                              value={draft.eventName}
                              maxLength={120}
                              placeholder="Summoner Skirmish"
                              onChange={(event) => set("eventName", event.target.value)}
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="meta-submit-event-date">
                              Day it was played
                            </FieldLabel>
                            <DatePicker
                              value={draft.eventDate}
                              onChange={(iso) => set("eventDate", iso)}
                              onClear={() => set("eventDate", "")}
                              className="w-full"
                            />
                            <FieldDescription>
                              For a tournament over several days, use the first one.
                            </FieldDescription>
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="meta-submit-event-format">Format</FieldLabel>
                            <Select
                              items={formatItems}
                              value={draft.eventFormat}
                              onValueChange={(value) => set("eventFormat", (value as string) ?? "")}
                            >
                              <SelectTrigger id="meta-submit-event-format" className="w-full">
                                <SelectValue placeholder="Pick a format" />
                              </SelectTrigger>
                              <SelectContent>
                                {Object.entries(formatItems).map(([value, label]) => (
                                  <SelectItem key={value} value={value}>
                                    {label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="meta-submit-event-players">
                              How many played (optional)
                            </FieldLabel>
                            <Input
                              id="meta-submit-event-players"
                              inputMode="numeric"
                              value={draft.eventPlayerCount}
                              placeholder="64"
                              onChange={(event) => set("eventPlayerCount", event.target.value)}
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="meta-submit-event-organizer">
                              Who ran it (optional)
                            </FieldLabel>
                            <Input
                              id="meta-submit-event-organizer"
                              value={draft.eventOrganizer}
                              maxLength={120}
                              placeholder="Rift Games Berlin"
                              onChange={(event) => set("eventOrganizer", event.target.value)}
                            />
                          </Field>
                          <Field>
                            <FieldLabel htmlFor="meta-submit-event-source">
                              Where you saw the results (optional)
                            </FieldLabel>
                            <Input
                              id="meta-submit-event-source"
                              value={draft.eventSourceUrl}
                              maxLength={2000}
                              placeholder="A results page, a stream VOD, a post"
                              onChange={(event) => set("eventSourceUrl", event.target.value)}
                            />
                            <FieldDescription>
                              A link is quickest to check and gets the tournament credited.
                            </FieldDescription>
                          </Field>
                          <Field>
                            <FieldDescription>
                              <Button
                                type="button"
                                variant="link-muted"
                                size="sm"
                                className="h-auto p-0"
                                onClick={() => setProposing(false)}
                              >
                                Pick one we already have instead
                              </Button>
                            </FieldDescription>
                          </Field>
                        </>
                      ) : null}
                    </FieldGroup>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>The player</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <FieldGroup>
                      <Field>
                        <FieldLabel htmlFor="meta-submit-player">Who played it</FieldLabel>
                        <Input
                          id="meta-submit-player"
                          value={draft.playerName}
                          maxLength={80}
                          placeholder="The player's name, as the results list it"
                          onChange={(event) => set("playerName", event.target.value)}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="meta-submit-rank">Where they finished</FieldLabel>
                        <Input
                          id="meta-submit-rank"
                          inputMode="numeric"
                          value={draft.rank}
                          placeholder="1"
                          className="w-24"
                          onChange={(event) => set("rank", event.target.value)}
                        />
                        <div className="flex items-start gap-2">
                          <Checkbox
                            id="meta-submit-rank-is-tier"
                            checked={draft.rankIsTier}
                            onCheckedChange={(checked) => set("rankIsTier", checked === true)}
                            className="mt-0.5"
                          />
                          <label htmlFor="meta-submit-rank-is-tier" className="cursor-pointer">
                            <span className="block">Only the bracket is known</span>
                            <span className="text-muted-foreground block text-sm">
                              Tick this when the results say &ldquo;top 8&rdquo; rather than an
                              exact placing. The archive will print it as T8.
                            </span>
                          </label>
                        </div>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="meta-submit-wins">Match record (optional)</FieldLabel>
                        <div className="flex items-center gap-2">
                          <Input
                            id="meta-submit-wins"
                            inputMode="numeric"
                            value={draft.wins}
                            placeholder="W"
                            aria-label="Wins"
                            className="w-16"
                            onChange={(event) => set("wins", event.target.value)}
                          />
                          <Input
                            inputMode="numeric"
                            value={draft.losses}
                            placeholder="L"
                            aria-label="Losses"
                            className="w-16"
                            onChange={(event) => set("losses", event.target.value)}
                          />
                          <Input
                            inputMode="numeric"
                            value={draft.draws}
                            placeholder="D"
                            aria-label="Draws"
                            className="w-16"
                            onChange={(event) => set("draws", event.target.value)}
                          />
                        </div>
                        <FieldDescription>Wins, losses, and draws.</FieldDescription>
                      </Field>
                    </FieldGroup>
                  </CardContent>
                </Card>
              </>
            )}

            <Card>
              <CardContent className="flex flex-col gap-2">
                <Label htmlFor="meta-submit-deck">Decklist</Label>
                <Textarea
                  id="meta-submit-deck"
                  value={draft.deckText}
                  rows={12}
                  className="font-mono text-sm"
                  placeholder={DECK_PLACEHOLDER}
                  onChange={(event) => set("deckText", event.target.value)}
                />
                <p className="text-muted-foreground text-sm">{deckHint}</p>

                {parsed && parsed.cards.length > 0 ? (
                  <ListReadback parsed={parsed} prefill={row} />
                ) : null}

                {noteExpanded ? (
                  <div className="flex flex-col gap-2 pt-2">
                    <Label htmlFor="meta-submit-note">
                      {kind === "correction"
                        ? "What's wrong with the list we have"
                        : "Note for the reviewer (optional)"}
                    </Label>
                    <Textarea
                      id="meta-submit-note"
                      value={draft.note}
                      rows={3}
                      maxLength={2000}
                      placeholder={
                        kind === "correction"
                          ? "What we got wrong, and where the right list came from"
                          : "Where you got the list, anything you're unsure about"
                      }
                      onChange={(event) => set("note", event.target.value)}
                    />
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto self-start p-0"
                    onClick={() => setNoteOpen(true)}
                  >
                    Add a note for the reviewer
                  </Button>
                )}
              </CardContent>
            </Card>

            {formError ? (
              <Alert variant="destructive">
                <TriangleAlertIcon />
                <AlertTitle>{formError}</AlertTitle>
              </Alert>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={submit.isPending || parsed === null || parsed.cards.length === 0}
                onClick={() => void handleSubmit()}
              >
                {submit.isPending ? "Sending…" : "Send decklist"}
              </Button>
              {cancelSlug === undefined ? (
                <Button variant="outline" render={<Link to="/meta" />}>
                  Cancel
                </Button>
              ) : (
                <Button
                  variant="outline"
                  render={<Link to="/meta/$slug" params={{ slug: cancelSlug }} />}
                >
                  Cancel
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
