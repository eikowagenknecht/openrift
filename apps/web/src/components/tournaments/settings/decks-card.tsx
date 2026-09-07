import type { TournamentDetailResponse } from "@openrift/shared";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
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
import { useServerSeededState } from "@/hooks/use-server-seeded-state";
import { useUpdateTournament } from "@/hooks/use-tournaments";
import { runReportedMutation } from "@/lib/run-reported-mutation";
import {
  combineLocalDateTimeToUtc,
  DECK_PHASE_LABEL,
  DECK_SUBMISSION_ITEMS,
  localTimeZoneLabel,
  splitUtcToLocalDateTime,
} from "@/lib/tournament-display";

export function DecksCard({
  detail,
  locked,
}: {
  detail: TournamentDetailResponse;
  locked: boolean;
}) {
  const updateTournament = useUpdateTournament();
  const closeInit = detail.submissionsCloseAt
    ? splitUtcToLocalDateTime(detail.submissionsCloseAt)
    : { date: "", time: "" };
  const [closeDate, setCloseDate] = useServerSeededState(closeInit.date);
  const [closeTime, setCloseTime] = useServerSeededState(closeInit.time);

  const tzLabel = localTimeZoneLabel();
  const deckExpected = detail.deckSubmission !== "none";

  const closeTouched = closeDate !== "" || closeTime !== "";
  const nextCloseAt = closeTouched ? combineLocalDateTimeToUtc(closeDate, closeTime) : null;
  const closeIncomplete = closeTouched && nextCloseAt === null;
  const closeAfterEnd =
    nextCloseAt !== null &&
    detail.endsAt !== null &&
    new Date(nextCloseAt) > new Date(detail.endsAt);
  const closeInvalid = closeIncomplete || closeAfterEnd;
  const closeChanged =
    (nextCloseAt === null) !== (detail.submissionsCloseAt === null) ||
    (nextCloseAt !== null &&
      detail.submissionsCloseAt !== null &&
      new Date(nextCloseAt).getTime() !== new Date(detail.submissionsCloseAt).getTime());

  return (
    <Card id="decks" className="scroll-mt-16">
      <CardHeader>
        <CardTitle>Decks</CardTitle>
        <CardDescription>
          When lists are collected, judges can verify them on the Deck check tab. Current phase:{" "}
          {DECK_PHASE_LABEL[detail.deckPhase]}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>Deck submission</Label>
          <Select
            items={DECK_SUBMISSION_ITEMS}
            value={detail.deckSubmission}
            disabled={locked || updateTournament.isPending}
            onValueChange={(value) => {
              if (value === "none" || value === "optional" || value === "required") {
                void runReportedMutation(() =>
                  updateTournament.mutateAsync({ id: detail.id, deckSubmission: value }),
                );
              }
            }}
          >
            <SelectTrigger className="max-w-sm" aria-label="Deck submission">
              <SelectValue placeholder="Deck submission" />
            </SelectTrigger>
            <SelectContent>
              {DECK_SUBMISSION_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {deckExpected ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Label>Submission deadline (optional)</Label>
              <div className="flex flex-wrap items-center gap-2">
                <DatePicker
                  value={closeDate}
                  onChange={setCloseDate}
                  onClear={() => setCloseDate("")}
                  disabled={locked}
                  className="w-44"
                />
                <Input
                  value={closeTime}
                  disabled={locked}
                  onChange={(event) => setCloseTime(event.target.value)}
                  placeholder="HH:mm"
                  aria-label="Deadline time (24h)"
                  className="w-24 tabular-nums"
                />
                <span className="text-muted-foreground text-sm">{tzLabel}</span>
                <Button
                  disabled={locked || closeInvalid || !closeChanged || updateTournament.isPending}
                  onClick={() =>
                    void runReportedMutation(() =>
                      updateTournament.mutateAsync({
                        id: detail.id,
                        submissionsCloseAt: nextCloseAt,
                      }),
                    )
                  }
                >
                  Save
                </Button>
              </div>
              {closeIncomplete ? (
                <span className="text-destructive text-sm">
                  Enter a date (YYYY-MM-DD) and a 24-hour time (HH:mm), or clear both.
                </span>
              ) : closeAfterEnd ? (
                <span className="text-destructive text-sm">
                  The deadline must be at or before the tournament ends.
                </span>
              ) : (
                <span className="text-muted-foreground text-sm">
                  Leave blank to keep lists open until you close the deck phase.
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-3">
                <Switch
                  id="t-allow-edits"
                  checked={detail.listLockMode === "at_deadline"}
                  disabled={locked || updateTournament.isPending}
                  onCheckedChange={(checked) =>
                    void runReportedMutation(() =>
                      updateTournament.mutateAsync({
                        id: detail.id,
                        listLockMode: checked ? "at_deadline" : "on_submit",
                      }),
                    )
                  }
                />
                <Label htmlFor="t-allow-edits">Let players edit their decks after submitting</Label>
              </div>
              <span className="text-muted-foreground text-sm">
                When off, a submitted deck is final and only a judge can unlock it. Riot&apos;s
                official rules require this. When on, players can keep editing until the submission
                deadline above.
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Pushing decklists from another tool</Label>
              <span className="text-muted-foreground text-sm">
                To send entrant lists in from a registration site or other tool, the API guide and
                this tournament&apos;s ID (<code className="break-all">{detail.id}</code>) live on
                the{" "}
                <Link
                  to="/tournaments/$id/decks"
                  params={{ id: detail.id }}
                  className="text-foreground font-medium underline"
                >
                  Deck check tab
                </Link>
                .
              </span>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
