import type { TournamentDetailResponse } from "@openrift/shared";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerSeededState } from "@/hooks/use-server-seeded-state";
import { useUpdateTournament } from "@/hooks/use-tournaments";
import {
  localTimeZoneLabel,
  parseScheduleInput,
  splitUtcToLocalDateTime,
} from "@/lib/tournament-display";

/**
 * Start and end times, entered in the host's local timezone and stored as UTC.
 * "End now" stamps the current instant so a running tournament can be closed
 * without picking a date.
 * @returns The schedule card.
 */
export function ScheduleCard({
  detail,
  locked,
  canEndEarly,
}: {
  detail: TournamentDetailResponse;
  locked: boolean;
  canEndEarly: boolean;
}) {
  const updateTournament = useUpdateTournament();
  const startInit = splitUtcToLocalDateTime(detail.startsAt);
  const endInit = detail.endsAt ? splitUtcToLocalDateTime(detail.endsAt) : { date: "", time: "" };
  const [startDate, setStartDate] = useServerSeededState(startInit.date);
  const [startTime, setStartTime] = useServerSeededState(startInit.time);
  const [endDate, setEndDate] = useServerSeededState(endInit.date);
  const [endTime, setEndTime] = useServerSeededState(endInit.time);

  const tzLabel = localTimeZoneLabel();
  const {
    startsAt: nextStartsAt,
    endsAt: nextEndsAt,
    endIncomplete,
    endBeforeStart,
    scheduleInvalid,
  } = parseScheduleInput(startDate, startTime, endDate, endTime);
  const startChanged =
    nextStartsAt !== null &&
    new Date(nextStartsAt).getTime() !== new Date(detail.startsAt).getTime();
  const endChanged =
    (nextEndsAt === null) !== (detail.endsAt === null) ||
    (nextEndsAt !== null &&
      detail.endsAt !== null &&
      new Date(nextEndsAt).getTime() !== new Date(detail.endsAt).getTime());
  const scheduleChanged = startChanged || endChanged;

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
    } catch {
      // Reported by the global mutation error toast (see reportMutationError).
    }
  }

  return (
    <Card id="schedule" className="scroll-mt-16">
      <CardHeader>
        <CardTitle>Schedule</CardTitle>
        <CardDescription>
          Times are in {tzLabel}. A tournament with no end auto-completes 24 hours after it starts.
          Set an end for a multi-day event.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
          <div className="flex flex-col gap-1.5">
            <Label>Starts</Label>
            <div className="flex flex-wrap items-center gap-2">
              <DatePicker
                value={startDate}
                onChange={setStartDate}
                onClear={() => setStartDate("")}
                disabled={locked}
                className="w-44"
              />
              <Input
                value={startTime}
                disabled={locked}
                onChange={(event) => setStartTime(event.target.value)}
                placeholder="HH:mm"
                aria-label="Start time (24h)"
                className="w-24 tabular-nums"
              />
            </div>
            {nextStartsAt === null ? (
              <span className="text-destructive text-sm">
                Enter a date (YYYY-MM-DD) and a 24-hour time (HH:mm).
              </span>
            ) : null}
          </div>
          <span className="text-muted-foreground mb-2 text-sm">to</span>
          <div className="flex flex-col gap-1.5">
            <Label>Ends (optional)</Label>
            <div className="flex flex-wrap items-center gap-2">
              <DatePicker
                value={endDate}
                onChange={setEndDate}
                onClear={() => setEndDate("")}
                disabled={locked}
                className="w-44"
              />
              <Input
                value={endTime}
                disabled={locked}
                onChange={(event) => setEndTime(event.target.value)}
                placeholder="HH:mm"
                aria-label="End time (24h)"
                className="w-24 tabular-nums"
              />
            </div>
            {endIncomplete ? (
              <span className="text-destructive text-sm">
                Enter both a date (YYYY-MM-DD) and a 24-hour time (HH:mm), or leave both blank.
              </span>
            ) : endBeforeStart ? (
              <span className="text-destructive text-sm">
                The end must be at or after the start.
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={locked || scheduleInvalid || !scheduleChanged || updateTournament.isPending}
            onClick={() => {
              if (nextStartsAt === null) {
                return;
              }
              void run(() =>
                updateTournament.mutateAsync({
                  id: detail.id,
                  startsAt: nextStartsAt,
                  endsAt: nextEndsAt,
                }),
              );
            }}
          >
            Save schedule
          </Button>
          {canEndEarly ? (
            <Button
              variant="secondary"
              disabled={updateTournament.isPending}
              onClick={() =>
                void run(() =>
                  updateTournament.mutateAsync({
                    id: detail.id,
                    endsAt: new Date().toISOString(),
                  }),
                )
              }
            >
              End now
            </Button>
          ) : null}
        </div>
        {locked ? (
          <p className="text-muted-foreground">This tournament is cancelled and read-only.</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
