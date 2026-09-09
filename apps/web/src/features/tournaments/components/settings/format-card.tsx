import type { TournamentDetailResponse } from "@openrift/shared/types/api/tournament";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { GroupCutSettingsFields } from "@/features/tournaments/components/group-cut-settings-fields";
import { useUpdateTournament } from "@/features/tournaments/hooks/use-tournament-mutations";
import type { TournamentRoundsChoice } from "@/features/tournaments/lib/tournament-display";
import {
  hasPairing,
  isGroupCutChoice,
  MATCH_FORMAT_LABEL,
  PAIRING_STYLE_LABEL,
  PLAY_MODE_ITEMS,
  pairingFromRoundsChoice,
  ROUNDS_CHOICE_ITEMS,
  roundsChoiceFor,
} from "@/features/tournaments/lib/tournament-display";
import { runReportedMutation } from "@/lib/run-reported-mutation";

export function FormatCard({
  detail,
  locked,
}: {
  detail: TournamentDetailResponse;
  locked: boolean;
}) {
  const updateTournament = useUpdateTournament();
  const runsRounds = hasPairing(detail.pairingStyle);
  const isSwiss = detail.pairingStyle === "swiss";
  const groupCut = detail.format === "group_cut";
  const roundsChoice = roundsChoiceFor(detail.pairingStyle, detail.matchFormat, detail.format);
  const roundsItems = ROUNDS_CHOICE_ITEMS.filter(
    (item) => detail.playMode !== "2v2" || (item.value !== "pod" && !isGroupCutChoice(item.value)),
  );
  const playModeItems = groupCut
    ? PLAY_MODE_ITEMS.filter((item) => item.value === "1v1")
    : PLAY_MODE_ITEMS;

  return (
    <Card id="pairings" className="scroll-mt-16">
      <CardHeader>
        <CardTitle>Format</CardTitle>
        <CardDescription>
          {detail.hasRounds
            ? `${detail.playMode === "2v2" ? "2v2 teams · " : ""}${PAIRING_STYLE_LABEL[detail.pairingStyle]}. The pairing engine is fixed once a round has been generated.`
            : "Can only change before the first round."}
        </CardDescription>
      </CardHeader>
      {detail.hasRounds ? null : (
        <CardContent className="flex flex-wrap gap-x-4 gap-y-3">
          <div className="flex flex-col gap-1.5">
            <Label>Play mode</Label>
            <Select
              items={playModeItems}
              value={detail.playMode}
              disabled={locked || updateTournament.isPending}
              onValueChange={(value) => {
                if (value === "1v1" || value === "2v2") {
                  void runReportedMutation(() =>
                    updateTournament.mutateAsync({
                      id: detail.id,
                      playMode: value,
                      pairingStyle:
                        value === "2v2" && detail.pairingStyle === "pod" ? "swiss" : undefined,
                      regionsEnabled: value === "2v2" && detail.regionsEnabled ? false : undefined,
                    }),
                  );
                }
              }}
            >
              <SelectTrigger aria-label="Play mode">
                <SelectValue placeholder="Play mode" />
              </SelectTrigger>
              <SelectContent>
                {playModeItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="t-pairings-enabled">Pairings</Label>
            <div className="flex h-8 items-center">
              <Switch
                id="t-pairings-enabled"
                checked={runsRounds}
                disabled={locked || updateTournament.isPending}
                onCheckedChange={(checked) => {
                  void runReportedMutation(() =>
                    updateTournament.mutateAsync({
                      id: detail.id,
                      pairingStyle: checked
                        ? detail.playMode === "2v2"
                          ? "swiss"
                          : "pod"
                        : "none",
                    }),
                  );
                }}
              />
            </div>
          </div>
          {roundsChoice ? (
            <div className="flex flex-col gap-1.5">
              <Label>Rounds</Label>
              <Select
                items={roundsItems}
                value={roundsChoice}
                disabled={locked || updateTournament.isPending}
                onValueChange={(value) => {
                  if (!value || value === roundsChoice) {
                    return;
                  }
                  const next = pairingFromRoundsChoice(value as TournamentRoundsChoice);
                  void runReportedMutation(() =>
                    updateTournament.mutateAsync({
                      id: detail.id,
                      pairingStyle: next.pairingStyle,
                      matchFormat: next.pairingStyle === "swiss" ? next.matchFormat : undefined,
                      format: next.format,
                      playMode: next.format === "group_cut" ? "1v1" : undefined,
                    }),
                  );
                }}
              >
                <SelectTrigger aria-label="Rounds">
                  <SelectValue placeholder="Rounds" />
                </SelectTrigger>
                <SelectContent>
                  {roundsItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {groupCut ? (
            <div className="basis-full">
              <GroupCutSettingsFields
                idPrefix="t-settings"
                disabled={locked || updateTournament.isPending}
                value={{
                  cutSize: detail.cutSize,
                  groupsSelfPaced: detail.groupsSelfPaced,
                  cutRematchAvoidance: detail.cutRematchAvoidance,
                  legendTiebreak: detail.legendTiebreak,
                }}
                onChange={(patch) => {
                  void runReportedMutation(() =>
                    updateTournament.mutateAsync({ id: detail.id, ...patch }),
                  );
                }}
              />
            </div>
          ) : null}
        </CardContent>
      )}
      {detail.hasRounds && groupCut ? (
        <CardContent className="text-muted-foreground text-sm">
          {MATCH_FORMAT_LABEL[detail.matchFormat]}, group stage with a top {detail.cutSize} cut. The
          format is fixed once the groups have been drawn.
        </CardContent>
      ) : null}
      {detail.hasRounds && isSwiss && !groupCut ? (
        <CardContent className="text-muted-foreground text-sm">
          {MATCH_FORMAT_LABEL[detail.matchFormat]}. The match format is fixed once a round has been
          generated.
        </CardContent>
      ) : null}
    </Card>
  );
}
