import type { MetaSubmissionResult } from "@openrift/shared";
import { formatDay } from "@openrift/shared";
import { Link } from "@tanstack/react-router";
import { CheckCircle2Icon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";

import {
  PageDescription,
  PageTopBar,
  PageTopBarActions,
  PageTopBarBack,
  PageTopBarButton,
  PageTopBarSticky,
  PageTopBarTitle,
} from "@/components/layout/page-top-bar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import type { MetaSubmissionCompleteness } from "@/lib/meta-submission-copy";
import {
  META_SUBMISSION_COMPLETENESS,
  metaSubmissionCompletenessHints,
  metaSubmissionCompletenessLabels,
} from "@/lib/meta-submission-copy";
import type {
  MetaSubmissionDraft,
  MetaSubmissionParsedList,
  MetaSubmissionPrefill,
} from "@/lib/meta-submission-form";
import {
  buildMetaSubmissionInput,
  metaSubmissionDraftFromPrefill,
  parseMetaSubmissionList,
  validateMetaSubmissionDraft,
} from "@/lib/meta-submission-form";
import { cn, PAGE_WIDTH } from "@/lib/utils";

/**
 * `/meta/submit` and `/meta/$slug/submit` — a signed-in player sends one
 * decklist to the archive (ADR-014's User submissions).
 *
 * The same form covers both targets the endpoint accepts. With a tournament the
 * archive already has, the deck hangs off that event directly. Without one, the
 * event fields appear and the submission proposes the tournament as well as the
 * deck; either way nothing it writes is public until someone reads it.
 */

/** The paste box's placeholder, so both the format and the shape are obvious. */
const DECK_PLACEHOLDER = `Legend:
1 Yasuo, Wandering Ronin

MainDeck:
3 Blade of the Exile
3 Windswept Vanguard

Battlefields:
1 Ionian Cliffside`;

/**
 * How a paste is described back once it has been read.
 *
 * @param props.parsed The last check's result.
 * @returns The summary block.
 */
function CheckedList({ parsed }: { parsed: MetaSubmissionParsedList }) {
  const total = parsed.cards.reduce((sum, card) => sum + card.quantity, 0);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-sm">
        Read {total} {total === 1 ? "card" : "cards"} across {parsed.cards.length}{" "}
        {parsed.cards.length === 1 ? "line" : "lines"}.
      </p>

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

/**
 * What the archive says back once a decklist is staged.
 *
 * Unresolved names are the one thing this screen must not bury: a deck whose
 * card names do not resolve cannot be added, and the person who typed it is the
 * only one who can say what they meant.
 *
 * @param props.result The submission result, including any unresolved names.
 * @param props.onSendAnother Returns to the form with the draft intact.
 * @returns The confirmation panel.
 */
function SubmissionSent({
  result,
  onSendAnother,
}: {
  result: MetaSubmissionResult;
  onSendAnother: () => void;
}) {
  const unresolved = result.unresolvedNames;
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
        <Button render={<Link to="/meta/submissions" />}>See what you&apos;ve sent</Button>
        <Button variant="outline" onClick={onSendAnother}>
          {unresolved.length === 0 ? "Send another" : "Fix the list and send again"}
        </Button>
      </div>
    </div>
  );
}

/**
 * The submission form.
 *
 * @param props.slug The archived event this targets, when the page was reached from one.
 * @param props.prefill The standings row the form was opened from, if any.
 * @returns The page element.
 */
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

  const [draft, setDraft] = useState<MetaSubmissionDraft>(() =>
    metaSubmissionDraftFromPrefill(prefill ?? {}),
  );
  const [selectedEventId, setSelectedEventId] = useState<string>(eventFromSlug?.id ?? "");
  // Proposing is a mode, not a value: the archive genuinely does not have the
  // tournament, so there is nothing to pick and the event fields take over. An
  // empty archive starts there, because a picker with nothing in it is a dead
  // end for the very first contributor.
  const [proposing, setProposing] = useState(eventFromSlug === undefined && events.length === 0);
  const [parsed, setParsed] = useState<MetaSubmissionParsedList | null>(null);
  const [formError, setFormError] = useState("");
  const [result, setResult] = useState<MetaSubmissionResult | null>(null);

  const lockedToEvent = eventFromSlug !== undefined;

  function set<TKey extends keyof MetaSubmissionDraft>(
    key: TKey,
    value: MetaSubmissionDraft[TKey],
  ) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function handleCheck() {
    const text = draft.deckText.trim();
    if (text.length === 0) {
      setFormError("Paste the decklist first.");
      return;
    }
    setFormError("");
    setParsed(parseMetaSubmissionList(text, allPrintings));
  }

  function applyOutcome(outcome: MetaSubmissionOutcome) {
    if (!outcome.ok) {
      setFormError(outcome.message);
      return;
    }
    setResult(outcome.result);
  }

  async function handleSubmit() {
    // Always read the box as it stands rather than trusting the last check, so
    // an edit after checking can never send the older list.
    const list = parseMetaSubmissionList(draft.deckText, allPrintings);
    setParsed(list);

    const problem = validateMetaSubmissionDraft(draft, {
      proposing,
      cardCount: list.cards.length,
    });
    if (problem) {
      setFormError(problem);
      return;
    }
    if (!proposing && selectedEventId === "") {
      setFormError("Pick the tournament this deck came from.");
      return;
    }

    const target = proposing ? null : { metaEventId: selectedEventId };
    const input = buildMetaSubmissionInput(draft, list.cards, target);
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

  return (
    <>
      <PageTopBarSticky width="capped">
        <PageTopBar>
          <PageTopBarBack to="/meta" />
          <PageTopBarTitle>Send a decklist</PageTopBarTitle>
          <PageTopBarActions>
            <PageTopBarButton render={<Link to="/meta/submissions" />}>
              What you&apos;ve sent
            </PageTopBarButton>
          </PageTopBarActions>
        </PageTopBar>
      </PageTopBarSticky>

      <div className={cn(PAGE_WIDTH.capped, "space-y-4 px-4 pt-3 pb-12")}>
        <PageDescription>
          Know what someone played at a tournament? Send the list and we&apos;ll add it to the
          archive.
        </PageDescription>

        {result ? (
          <SubmissionSent result={result} onSendAnother={handleSendAnother} />
        ) : (
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
                      <FieldLabel>Tournament</FieldLabel>
                      <p className="font-medium">{eventFromSlug.name}</p>
                      <FieldDescription>
                        {formatDay(eventFromSlug.eventDate)} ·{" "}
                        {formatLabels[eventFromSlug.format] ?? eventFromSlug.format}
                      </FieldDescription>
                      <FieldDescription>
                        <Link to="/meta/submit" className="underline underline-offset-4">
                          A different tournament?
                        </Link>
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
                        <FieldLabel htmlFor="meta-submit-event-name">Tournament name</FieldLabel>
                        <Input
                          id="meta-submit-event-name"
                          value={draft.eventName}
                          maxLength={120}
                          placeholder="Summoner Skirmish"
                          onChange={(event) => set("eventName", event.target.value)}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="meta-submit-event-date">Day it was played</FieldLabel>
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
                          Tick this when the results say &ldquo;top 8&rdquo; rather than an exact
                          placing. The archive will print it as T8.
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

            <Card>
              <CardHeader>
                <CardTitle>The deck</CardTitle>
                <CardDescription>Paste a deck code or a plain list.</CardDescription>
              </CardHeader>
              <CardContent>
                <FieldGroup>
                  <Field>
                    <FieldLabel>How much of it do you have?</FieldLabel>
                    <RadioGroup
                      value={draft.listStatus}
                      onValueChange={(next) =>
                        set("listStatus", next as MetaSubmissionCompleteness)
                      }
                      className="flex flex-col gap-3"
                      aria-label="How much of it do you have?"
                    >
                      {META_SUBMISSION_COMPLETENESS.map((option) => {
                        const radioId = `meta-submit-completeness-${option}`;
                        return (
                          <div key={option} className="flex items-start gap-2">
                            <RadioGroupItem id={radioId} value={option} className="mt-1" />
                            <label htmlFor={radioId} className="cursor-pointer">
                              <span className="block">
                                {metaSubmissionCompletenessLabels[option]}
                              </span>
                              <span className="text-muted-foreground block text-sm">
                                {metaSubmissionCompletenessHints[option]}
                              </span>
                            </label>
                          </div>
                        );
                      })}
                    </RadioGroup>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="meta-submit-deck">The decklist</FieldLabel>
                    <Textarea
                      id="meta-submit-deck"
                      value={draft.deckText}
                      rows={12}
                      className="font-mono text-sm"
                      placeholder={DECK_PLACEHOLDER}
                      onChange={(event) => set("deckText", event.target.value)}
                    />
                    <FieldDescription>
                      A deck code, a TTS export, or one card per line under its zone heading.
                    </FieldDescription>
                  </Field>

                  <Field>
                    <Button type="button" variant="outline" onClick={handleCheck}>
                      Check the list
                    </Button>
                  </Field>

                  {parsed ? <CheckedList parsed={parsed} /> : null}
                </FieldGroup>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Anything else</CardTitle>
              </CardHeader>
              <CardContent>
                <Field>
                  <FieldLabel htmlFor="meta-submit-note">
                    Note for the reviewer (optional)
                  </FieldLabel>
                  <Textarea
                    id="meta-submit-note"
                    value={draft.note}
                    rows={3}
                    maxLength={2000}
                    placeholder="Where you got the list, anything you're unsure about"
                    onChange={(event) => set("note", event.target.value)}
                  />
                </Field>
              </CardContent>
            </Card>

            {formError ? (
              <Alert variant="destructive">
                <TriangleAlertIcon />
                <AlertTitle>{formError}</AlertTitle>
              </Alert>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={submit.isPending} onClick={() => void handleSubmit()}>
                {submit.isPending ? "Sending…" : "Send the decklist"}
              </Button>
              <Button variant="outline" render={<Link to="/meta" />}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
