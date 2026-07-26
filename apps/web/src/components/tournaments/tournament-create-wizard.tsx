import type {
  TournamentDeckSubmission,
  TournamentMatchFormat,
  TournamentPairingStyle,
  TournamentPlayMode,
} from "@openrift/shared";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageTopBar, PageTopBarSticky, PageTopBarTitle } from "@/components/layout/page-top-bar";
import { SettingsGroup } from "@/components/layout/settings-group";
import {
  TopBarBreadcrumbSeparator,
  TopBarBreadcrumbTrail,
} from "@/components/layout/top-bar-breadcrumb";
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
import { useFriendGroups } from "@/hooks/use-friend-groups";
import { useMyOrganizations } from "@/hooks/use-organizations";
import { useCreateTournament } from "@/hooks/use-tournaments";
import {
  combineLocalDateTimeToUtc,
  DECK_SUBMISSION_ITEMS,
  hasPairing,
  localTimeZoneLabel,
  MATCH_FORMAT_ITEMS,
  PAIRING_STYLE_ITEMS,
  parseScheduleInput,
  PLAY_MODE_ITEMS,
  splitUtcToLocalDateTime,
} from "@/lib/tournament-display";
import { cn, PAGE_PADDING_NO_TOP } from "@/lib/utils";

export function TournamentCreateWizard({ defaultGroupId }: { defaultGroupId?: string }) {
  const navigate = useNavigate();
  const createTournament = useCreateTournament();
  const { data: orgsData } = useMyOrganizations();
  const { data: groupsData } = useFriendGroups();

  // The route hands us a group id (a uuid). Resolve it against the viewer's own
  // groups: an unknown value (a slug passed by mistake, or a group the viewer
  // left) falls back to "none" so it can never reach the `z.uuid()` create
  // contract as a group id. This is the type-safety backstop for the create-
  // from-group prefill.
  const initialGroupId =
    defaultGroupId && groupsData.items.some((group) => group.id === defaultGroupId)
      ? defaultGroupId
      : "none";
  const hasInitialGroup = initialGroupId !== "none";

  const [name, setName] = useState("");
  const [hostValue, setHostValue] = useState("user");
  const [pairingStyle, setPairingStyle] = useState<TournamentPairingStyle>("pod");
  const [playMode, setPlayMode] = useState<TournamentPlayMode>("1v1");
  const [matchFormat, setMatchFormat] = useState<TournamentMatchFormat>("bo1");
  const [winPointsText, setWinPointsText] = useState("3");
  const [drawPointsText, setDrawPointsText] = useState("1");
  const [byePointsText, setByePointsText] = useState("3");
  const [regionsEnabled, setRegionsEnabled] = useState(false);
  const [deckSubmission, setDeckSubmission] = useState<TournamentDeckSubmission>(
    hasInitialGroup ? "required" : "none",
  );
  const [selfRegistration, setSelfRegistration] = useState(false);
  const [groupId, setGroupId] = useState(initialGroupId);
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [closeDate, setCloseDate] = useState("");
  const [closeTime, setCloseTime] = useState("");
  const [lockMode, setLockMode] = useState<"on_submit" | "at_deadline">("at_deadline");

  // Prefill the start to the current local time on mount (client-only so the
  // SSR clock never mismatches the hydrated one).
  useEffect(() => {
    const nowLocal = splitUtcToLocalDateTime(new Date().toISOString());
    setStartDate(nowLocal.date);
    setStartTime(nowLocal.time);
  }, []);

  const hostItems = [
    { value: "user", label: "You (personal)" },
    ...orgsData.items.map((org) => ({ value: org.id, label: org.name })),
  ];
  const groupItems = [
    { value: "none", label: "Not linked to a group" },
    ...groupsData.items.map((group) => ({ value: group.id, label: group.name })),
  ];

  const tzLabel = localTimeZoneLabel();
  const wantsDeck = deckSubmission !== "none";
  const runsRounds = hasPairing(pairingStyle);
  const isSwiss = pairingStyle === "swiss";
  const isTeams = playMode === "2v2";
  // 2v2 pairs team Swiss: free-for-all pods don't compose with fixed teams,
  // and the region layer isn't team-aware yet.
  const pairingItems = isTeams
    ? PAIRING_STYLE_ITEMS.filter((item) => item.value !== "pod")
    : PAIRING_STYLE_ITEMS;

  function handlePlayModeChange(value: TournamentPlayMode) {
    setPlayMode(value);
    if (value === "2v2" && pairingStyle === "pod") {
      setPairingStyle("swiss");
    }
  }
  // Points inputs: an integer 0-99, kept as text for controlled editing.
  const parsePoints = (text: string): number | null => {
    if (!/^\d{1,2}$/u.test(text.trim())) {
      return null;
    }
    return Number(text.trim());
  };
  const winPoints = parsePoints(winPointsText);
  const drawPoints = parsePoints(drawPointsText);
  const byePoints = parsePoints(byePointsText);
  const pointsInvalid =
    runsRounds && (byePoints === null || (isSwiss && (winPoints === null || drawPoints === null)));
  const submissionsCloseAt = wantsDeck ? combineLocalDateTimeToUtc(closeDate, closeTime) : null;
  const closeTimeInvalid =
    wantsDeck && (closeDate !== "" || closeTime !== "") && submissionsCloseAt === null;
  // Start + end parsing and validation, shared with the settings tab so the two
  // surfaces stay in step.
  const { startsAt, endsAt, startInvalid, endIncomplete, endBeforeStart, scheduleInvalid } =
    parseScheduleInput(startDate, startTime, endDate, endTime);

  async function handleCreate() {
    if (!name.trim() || !startsAt || closeTimeInvalid || scheduleInvalid || pointsInvalid) {
      return;
    }
    const host =
      hostValue === "user"
        ? ({ type: "user" } as const)
        : ({ type: "organization", orgId: hostValue } as const);
    const linkedGroupId = groupId === "none" ? null : groupId;
    const listLockMode = wantsDeck ? lockMode : undefined;
    // Built before the try block: the React Compiler cannot lower conditional
    // value blocks inside try/catch and would bail out of this component.
    const payload = {
      name: name.trim(),
      host,
      pairingStyle,
      playMode,
      matchFormat: isSwiss ? matchFormat : undefined,
      winPoints: isSwiss ? (winPoints ?? undefined) : undefined,
      drawPoints: isSwiss ? (drawPoints ?? undefined) : undefined,
      byePoints: runsRounds ? (byePoints ?? undefined) : undefined,
      regionsEnabled: runsRounds && !isTeams ? regionsEnabled : undefined,
      startsAt,
      endsAt,
      deckSubmission,
      selfRegistration,
      groupId: linkedGroupId,
      submissionsCloseAt,
      listLockMode,
    };
    try {
      const created = await createTournament.mutateAsync(payload);
      void navigate({ to: "/tournaments/$id", params: { id: created.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't create tournament");
    }
  }

  return (
    <>
      <PageTopBarSticky maxWidth="4xl">
        <PageTopBar className="gap-2">
          <TopBarBreadcrumbTrail
            segments={[{ label: "Tournaments", link: <Link to="/tournaments" /> }]}
          />
          <TopBarBreadcrumbSeparator className="hidden sm:inline" />
          <PageTopBarTitle>New tournament</PageTopBarTitle>
        </PageTopBar>
      </PageTopBarSticky>
      <div className={cn("mx-auto flex w-full max-w-4xl flex-col gap-6 pt-3", PAGE_PADDING_NO_TOP)}>
        <SettingsGroup id="general" title="General">
          <Card>
            <CardHeader>
              <CardTitle>Name</CardTitle>
              <CardDescription>The tournament&apos;s display name.</CardDescription>
            </CardHeader>
            <CardContent>
              <Input
                id="t-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                className="max-w-sm"
                aria-label="Tournament name"
                placeholder="Summoner Skirmish"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Host</CardTitle>
              <CardDescription>
                Who runs this tournament. An organization brings in its owners, managers, and judges
                automatically. As a personal host, that is just you. You can also link it to one of
                your groups.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Host</Label>
                <Select
                  items={hostItems}
                  value={hostValue}
                  onValueChange={(value) => value && setHostValue(value)}
                >
                  <SelectTrigger className="max-w-sm" aria-label="Host">
                    <SelectValue placeholder="Choose a host" />
                  </SelectTrigger>
                  <SelectContent>
                    {hostItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Group (optional)</Label>
                <Select
                  items={groupItems}
                  value={groupId}
                  onValueChange={(value) => value && setGroupId(value)}
                >
                  <SelectTrigger className="max-w-sm" aria-label="Group">
                    <SelectValue placeholder="Not linked to a group" />
                  </SelectTrigger>
                  <SelectContent>
                    {groupItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Schedule</CardTitle>
              <CardDescription>
                Times are in {tzLabel}. A tournament with no end auto-completes 24 hours after it
                starts. Set an end for a multi-day event.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
                <div className="flex flex-col gap-1.5">
                  <Label>Starts</Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <DatePicker
                      value={startDate}
                      onChange={setStartDate}
                      onClear={() => setStartDate("")}
                      className="w-44"
                    />
                    <Input
                      value={startTime}
                      onChange={(event) => setStartTime(event.target.value)}
                      placeholder="HH:mm"
                      aria-label="Start time (24h)"
                      className="w-24 tabular-nums"
                    />
                  </div>
                  {startInvalid ? (
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
                      className="w-44"
                    />
                    <Input
                      value={endTime}
                      onChange={(event) => setEndTime(event.target.value)}
                      placeholder="HH:mm"
                      aria-label="End time (24h)"
                      className="w-24 tabular-nums"
                    />
                  </div>
                  {endIncomplete ? (
                    <span className="text-destructive text-sm">
                      Enter both a date (YYYY-MM-DD) and a 24-hour time (HH:mm), or leave both
                      blank.
                    </span>
                  ) : endBeforeStart ? (
                    <span className="text-destructive text-sm">
                      The end must be at or after the start.
                    </span>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
        </SettingsGroup>

        <SettingsGroup id="pairings-decks" title="Pairings & decks">
          <Card>
            <CardHeader>
              <CardTitle>Pairings</CardTitle>
              <CardDescription>
                Let OpenRift pair rounds and track standings, or leave it off if you run pairings
                somewhere else.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Play mode</Label>
                <Select
                  items={PLAY_MODE_ITEMS}
                  value={playMode}
                  onValueChange={(value) =>
                    value && handlePlayModeChange(value as TournamentPlayMode)
                  }
                >
                  <SelectTrigger className="max-w-sm" aria-label="Play mode">
                    <SelectValue placeholder="Play mode" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLAY_MODE_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isTeams ? (
                  <span className="text-muted-foreground text-sm">
                    You pair players into fixed teams of two on the Participants page; rounds pair
                    team against team.
                  </span>
                ) : null}
              </div>
              <Select
                items={pairingItems}
                value={pairingStyle}
                onValueChange={(value) => value && setPairingStyle(value as TournamentPairingStyle)}
              >
                <SelectTrigger className="max-w-sm" aria-label="Pairings">
                  <SelectValue placeholder="Choose how players are paired" />
                </SelectTrigger>
                <SelectContent>
                  {pairingItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isSwiss ? (
                <div className="flex flex-col gap-1.5">
                  <Label>Match format</Label>
                  <Select
                    items={MATCH_FORMAT_ITEMS}
                    value={matchFormat}
                    onValueChange={(value) =>
                      value && setMatchFormat(value as TournamentMatchFormat)
                    }
                  >
                    <SelectTrigger className="max-w-sm" aria-label="Match format">
                      <SelectValue placeholder="Match format" />
                    </SelectTrigger>
                    <SelectContent>
                      {MATCH_FORMAT_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {runsRounds ? (
            <Card>
              <CardHeader>
                <CardTitle>Points</CardTitle>
                <CardDescription>
                  {isSwiss
                    ? "Points a match win, a draw, and a bye are worth. Standings recalculate if you change these later."
                    : "Points a bye (sitting a round out) is worth. Standings recalculate if you change this later."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {isSwiss ? (
                    <>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="t-win-points">Win</Label>
                        <Input
                          id="t-win-points"
                          value={winPointsText}
                          onChange={(event) => setWinPointsText(event.target.value)}
                          inputMode="numeric"
                          className="w-20 tabular-nums"
                          aria-label="Points for a match win"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="t-draw-points">Draw</Label>
                        <Input
                          id="t-draw-points"
                          value={drawPointsText}
                          onChange={(event) => setDrawPointsText(event.target.value)}
                          inputMode="numeric"
                          className="w-20 tabular-nums"
                          aria-label="Points for a draw"
                        />
                      </div>
                    </>
                  ) : null}
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="t-bye-points">Bye</Label>
                    <Input
                      id="t-bye-points"
                      value={byePointsText}
                      onChange={(event) => setByePointsText(event.target.value)}
                      inputMode="numeric"
                      className="w-20 tabular-nums"
                      aria-label="Points for a bye"
                    />
                  </div>
                </div>
                {pointsInvalid ? (
                  <span className="text-destructive mt-2 block text-sm">
                    Points must be whole numbers between 0 and 99.
                  </span>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {runsRounds && !isTeams ? (
            <Card>
              <CardHeader>
                <CardTitle>Regions</CardTitle>
                <CardDescription>
                  Track a region per player. Pairings avoid same-region matchups, and standings add
                  a per-region leaderboard.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Switch
                    id="t-regions"
                    checked={regionsEnabled}
                    onCheckedChange={setRegionsEnabled}
                  />
                  <Label htmlFor="t-regions">Track player regions</Label>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Decks</CardTitle>
              <CardDescription>
                Collect decklists in OpenRift, or leave it off if you track lists elsewhere. When
                lists are collected, judges can verify them on the Deck check tab.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Deck submission</Label>
                <Select
                  items={DECK_SUBMISSION_ITEMS}
                  value={deckSubmission}
                  onValueChange={(value) =>
                    value && setDeckSubmission(value as TournamentDeckSubmission)
                  }
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

              {wantsDeck ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Label>Submission deadline (optional)</Label>
                    <div className="flex flex-wrap items-center gap-2">
                      <DatePicker
                        value={closeDate}
                        onChange={setCloseDate}
                        onClear={() => setCloseDate("")}
                        className="w-44"
                      />
                      <Input
                        value={closeTime}
                        onChange={(event) => setCloseTime(event.target.value)}
                        placeholder="HH:mm"
                        aria-label="Deadline time (24h)"
                        className="w-24 tabular-nums"
                      />
                      <span className="text-muted-foreground text-sm">{tzLabel}</span>
                    </div>
                    {closeTimeInvalid ? (
                      <span className="text-destructive text-sm">
                        Enter a date (YYYY-MM-DD) and a 24-hour time (HH:mm).
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-3">
                      <Switch
                        id="t-allow-edits"
                        checked={lockMode === "at_deadline"}
                        onCheckedChange={(checked) =>
                          setLockMode(checked ? "at_deadline" : "on_submit")
                        }
                      />
                      <Label htmlFor="t-allow-edits">
                        Let players edit their decks after submitting
                      </Label>
                    </div>
                    <span className="text-muted-foreground text-sm">
                      When off, a submitted deck is final and only a judge can unlock it.
                      Riot&apos;s official rules require this. When on, players can keep editing
                      until the submission deadline above.
                    </span>
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </SettingsGroup>

        <SettingsGroup id="registration" title="Registration">
          <Card>
            <CardHeader>
              <CardTitle>Self-registration</CardTitle>
              <CardDescription>
                Let players request a spot through a shareable link. You can copy and share the link
                after creating the tournament.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Switch
                  id="t-self-reg"
                  checked={selfRegistration}
                  onCheckedChange={setSelfRegistration}
                />
                <Label htmlFor="t-self-reg">Open self-registration</Label>
              </div>
            </CardContent>
          </Card>
        </SettingsGroup>

        <div className="flex items-center gap-2">
          <Button
            onClick={handleCreate}
            disabled={
              !name.trim() ||
              closeTimeInvalid ||
              scheduleInvalid ||
              pointsInvalid ||
              createTournament.isPending
            }
          >
            Create tournament
          </Button>
          <Button variant="ghost" render={<Link to="/tournaments" />}>
            Cancel
          </Button>
        </div>
      </div>
    </>
  );
}
