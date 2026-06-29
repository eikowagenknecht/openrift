import type { TournamentDetailResponse } from "@openrift/shared";
import { useNavigate } from "@tanstack/react-router";
import { QRCodeSVG } from "qrcode.react";
import { Suspense, useState } from "react";
import { toast } from "sonner";

import type { PageTocItem } from "@/components/layout/page-toc";
import { SettingsGroup } from "@/components/layout/settings-group";
import { SettingsLayout } from "@/components/layout/settings-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import { Switch } from "@/components/ui/switch";
import { useMyOrganizations } from "@/hooks/use-organizations";
import {
  useCancelTournament,
  useDeleteTournament,
  useSetTournamentReportToken,
  useSetTournamentSubmissionToken,
  useUpdateTournament,
} from "@/hooks/use-tournaments";
import { getSiteUrl } from "@/lib/site-config";
import {
  combineLocalDateTimeToUtc,
  DECK_PHASE_LABEL,
  DECK_SUBMISSION_ITEMS,
  effectiveTournamentState,
  localTimeZoneLabel,
  PAIRING_STYLE_ITEMS,
  PAIRING_STYLE_LABEL,
  parseScheduleInput,
  splitUtcToLocalDateTime,
} from "@/lib/tournament-display";

/**
 * Build the TOC for the settings page, hiding the host and follow-along
 * entries when those cards aren't rendered for this tournament/role.
 * @returns The ordered list of TOC items.
 */
function buildTocItems({ isHost, isPod }: { isHost: boolean; isPod: boolean }): PageTocItem[] {
  return [
    { id: "general", label: "General" },
    { id: "name", label: "Name", level: 1 },
    ...(isHost ? [{ id: "host", label: "Host", level: 1 }] : []),
    { id: "schedule", label: "Schedule", level: 1 },
    { id: "pairings-decks", label: "Pairings & decks" },
    { id: "pairings", label: "Pairings", level: 1 },
    { id: "decks", label: "Decks", level: 1 },
    { id: "sharing", label: "Sharing" },
    { id: "signup-links", label: "Sign-up links", level: 1 },
    ...(isPod ? [{ id: "follow-along", label: "Follow-along", level: 1 }] : []),
    { id: "danger-zone", label: "Danger zone" },
  ];
}

export function TournamentSettingsTab({ detail }: { detail: TournamentDetailResponse }) {
  const navigate = useNavigate();
  const updateTournament = useUpdateTournament();
  const setSubmissionToken = useSetTournamentSubmissionToken();
  const setReportToken = useSetTournamentReportToken();
  const cancelTournament = useCancelTournament();
  const deleteTournament = useDeleteTournament();

  const startInit = splitUtcToLocalDateTime(detail.startsAt);
  const endInit = detail.endsAt ? splitUtcToLocalDateTime(detail.endsAt) : { date: "", time: "" };
  const closeInit = detail.submissionsCloseAt
    ? splitUtcToLocalDateTime(detail.submissionsCloseAt)
    : { date: "", time: "" };
  const [name, setName] = useState(detail.name);
  const [startDate, setStartDate] = useState(startInit.date);
  const [startTime, setStartTime] = useState(startInit.time);
  const [endDate, setEndDate] = useState(endInit.date);
  const [endTime, setEndTime] = useState(endInit.time);
  const [closeDate, setCloseDate] = useState(closeInit.date);
  const [closeTime, setCloseTime] = useState(closeInit.time);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmDisableReport, setConfirmDisableReport] = useState(false);

  const id = detail.id;
  const isPod = detail.pairingStyle === "pod";
  const isHost = detail.myRoles.includes("host");
  const tzLabel = localTimeZoneLabel();
  const effectiveState = effectiveTournamentState(detail.startsAt, detail.endsAt, detail.status);
  const locked = effectiveState === "cancelled";
  const canEndEarly = effectiveState !== "completed" && effectiveState !== "cancelled";

  // Schedule editing (entered in the host's local timezone).
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

  // Deck submission deadline editing (also in the host's local timezone). Both
  // parts empty means "no deadline" (lists stay open until the host closes the
  // phase). An at-deadline lock with no deadline never auto-locks.
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

  const registrationUrl = detail.submissionToken
    ? `${getSiteUrl()}/tournaments/submit/${detail.submissionToken}`
    : null;
  const deckExpected = detail.deckSubmission !== "none";
  // The link is shown when it does something: open registration or deck submission.
  const showLink = detail.selfRegistration || deckExpected;
  const reportUrl = detail.reportToken
    ? `${getSiteUrl()}/tournaments/report/${detail.reportToken}`
    : null;

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    }
  }

  return (
    <SettingsLayout toc={buildTocItems({ isHost, isPod })}>
      <SettingsGroup id="general" title="General">
        <Card id="name" className="scroll-mt-16">
          <CardHeader>
            <CardTitle>Name</CardTitle>
            <CardDescription>The tournament&apos;s display name.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex max-w-sm gap-2">
              <Input
                id="t-rename"
                value={name}
                maxLength={120}
                disabled={locked}
                aria-label="Tournament name"
                onChange={(event) => setName(event.target.value)}
              />
              <Button
                disabled={
                  locked ||
                  !name.trim() ||
                  name.trim() === detail.name ||
                  updateTournament.isPending
                }
                onClick={() =>
                  void run(() => updateTournament.mutateAsync({ id, name: name.trim() }))
                }
              >
                Save
              </Button>
            </div>
          </CardContent>
        </Card>

        {isHost ? (
          <Suspense fallback={null}>
            <HostSection detail={detail} locked={locked} />
          </Suspense>
        ) : null}

        <Card id="schedule" className="scroll-mt-16">
          <CardHeader>
            <CardTitle>Schedule</CardTitle>
            <CardDescription>
              Times are in {tzLabel}. A tournament with no end auto-completes 24 hours after it
              starts. Set an end for a multi-day event.
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
                disabled={
                  locked || scheduleInvalid || !scheduleChanged || updateTournament.isPending
                }
                onClick={() => {
                  if (nextStartsAt === null) {
                    return;
                  }
                  void run(() =>
                    updateTournament.mutateAsync({
                      id,
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
                      updateTournament.mutateAsync({ id, endsAt: new Date().toISOString() }),
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
      </SettingsGroup>

      <SettingsGroup id="pairings-decks" title="Pairings & decks">
        <Card id="pairings" className="scroll-mt-16">
          <CardHeader>
            <CardTitle>Pairings</CardTitle>
            <CardDescription>
              {detail.hasRounds
                ? `${PAIRING_STYLE_LABEL[detail.pairingStyle]}. The pairing engine is fixed once a round has been generated.`
                : "Let OpenRift pair rounds and track standings, or leave it off if you run pairings somewhere else. Can only change before the first round."}
            </CardDescription>
          </CardHeader>
          {detail.hasRounds ? null : (
            <CardContent className="flex flex-col gap-2">
              <Select
                items={PAIRING_STYLE_ITEMS}
                value={detail.pairingStyle}
                disabled={locked || updateTournament.isPending}
                onValueChange={(value) => {
                  if (value === "pod" || value === "none") {
                    void run(() => updateTournament.mutateAsync({ id, pairingStyle: value }));
                  }
                }}
              >
                <SelectTrigger className="max-w-sm" aria-label="Pairings">
                  <SelectValue placeholder="Pairings" />
                </SelectTrigger>
                <SelectContent>
                  {PAIRING_STYLE_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          )}
        </Card>

        <Card id="decks" className="scroll-mt-16">
          <CardHeader>
            <CardTitle>Decks</CardTitle>
            <CardDescription>
              Collect decklists in OpenRift, or leave it off if you track lists elsewhere. When
              lists are collected, judges can verify them on the Deck check tab. Current phase:{" "}
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
                    void run(() => updateTournament.mutateAsync({ id, deckSubmission: value }));
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
                      disabled={
                        locked || closeInvalid || !closeChanged || updateTournament.isPending
                      }
                      onClick={() =>
                        void run(() =>
                          updateTournament.mutateAsync({ id, submissionsCloseAt: nextCloseAt }),
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
                        void run(() =>
                          updateTournament.mutateAsync({
                            id,
                            listLockMode: checked ? "at_deadline" : "on_submit",
                          }),
                        )
                      }
                    />
                    <Label htmlFor="t-allow-edits">
                      Let players edit their decks after submitting
                    </Label>
                  </div>
                  <span className="text-muted-foreground text-sm">
                    When off, a submitted deck is final and only a judge can unlock it. Riot&apos;s
                    official rules require this. When on, players can keep editing until the
                    submission deadline above.
                  </span>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      </SettingsGroup>

      <SettingsGroup id="sharing" title="Sharing">
        <Card id="signup-links" className="scroll-mt-16">
          <CardHeader>
            <CardTitle>Sign-up &amp; deck links</CardTitle>
            <CardDescription>
              When on, anyone with the link below can request a spot; requests appear on the
              Overview tab for approval.
              {deckExpected ? " Players also submit their decks through this link." : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Switch
                id="t-self-reg"
                checked={detail.selfRegistration}
                disabled={locked || updateTournament.isPending}
                onCheckedChange={(checked) =>
                  void run(() => updateTournament.mutateAsync({ id, selfRegistration: checked }))
                }
              />
              <Label htmlFor="t-self-reg">Open self-registration</Label>
            </div>
            {showLink && registrationUrl ? (
              <div className="flex flex-col gap-2">
                <Label>
                  {detail.selfRegistration ? "Registration link" : "Deck submission link"}
                </Label>
                <div className="flex gap-2">
                  <Input readOnly value={registrationUrl} aria-label="Share link" />
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      await navigator.clipboard.writeText(registrationUrl);
                      toast.success("Link copied");
                    }}
                  >
                    Copy
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={locked || setSubmissionToken.isPending}
                    onClick={() => setConfirmRotate(true)}
                  >
                    Rotate link
                  </Button>
                </div>
                <p className="text-muted-foreground text-sm">
                  Rotating makes a new link and stops the old one working.
                </p>
                {/* QR modules need a light background to scan in either theme. */}
                <div className="w-fit rounded-md bg-white p-3">
                  <QRCodeSVG value={registrationUrl} size={160} />
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {isPod ? (
          <Card id="follow-along" className="scroll-mt-16">
            <CardHeader>
              <CardTitle>Participant follow-along link</CardTitle>
              <CardDescription>
                Players can follow rounds and report their own pod result. Nothing counts until you
                finalize the round.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {reportUrl ? (
                <div className="flex gap-2">
                  <Input readOnly value={reportUrl} aria-label="Follow-along link" />
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      await navigator.clipboard.writeText(reportUrl);
                      toast.success("Link copied");
                    }}
                  >
                    Copy
                  </Button>
                  <Button
                    variant="ghost"
                    className="text-destructive"
                    disabled={setReportToken.isPending}
                    onClick={() => setConfirmDisableReport(true)}
                  >
                    Disable link
                  </Button>
                </div>
              ) : (
                <Button
                  className="w-fit"
                  disabled={locked || setReportToken.isPending}
                  onClick={() => void run(() => setReportToken.mutateAsync({ id, enabled: true }))}
                >
                  Enable follow-along link
                </Button>
              )}
            </CardContent>
          </Card>
        ) : null}
      </SettingsGroup>

      <SettingsGroup id="danger-zone" title="Danger zone">
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle>Danger zone</CardTitle>
            <CardDescription>
              Cancel makes the tournament read-only but keeps its data. Delete removes it and
              everything in it for good.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {detail.status === "cancelled" ? null : (
                <Button variant="secondary" onClick={() => setConfirmCancel(true)}>
                  Cancel tournament
                </Button>
              )}
              <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
                Delete tournament
              </Button>
            </div>
          </CardContent>
        </Card>
      </SettingsGroup>

      <Dialog open={confirmRotate} onOpenChange={setConfirmRotate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rotate the link?</DialogTitle>
            <DialogDescription>
              This makes a new link and immediately stops the old one working. Anyone you already
              shared it with will need the new link.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmRotate(false)}>
              Keep current link
            </Button>
            <Button
              disabled={locked || setSubmissionToken.isPending}
              onClick={async () => {
                await run(() => setSubmissionToken.mutateAsync({ id, enabled: true }));
                setConfirmRotate(false);
              }}
            >
              Rotate link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDisableReport} onOpenChange={setConfirmDisableReport}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disable the follow-along link?</DialogTitle>
            <DialogDescription>
              The link stops working for everyone. You can enable a new one later, but it will be a
              different link.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDisableReport(false)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              disabled={setReportToken.isPending}
              onClick={async () => {
                await run(() => setReportToken.mutateAsync({ id, enabled: false }));
                setConfirmDisableReport(false);
              }}
            >
              Disable link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel {detail.name}?</DialogTitle>
            <DialogDescription>
              The tournament becomes read-only for everyone. Its data is kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
              Keep it
            </Button>
            <Button
              variant="secondary"
              disabled={cancelTournament.isPending}
              onClick={async () => {
                await run(() => cancelTournament.mutateAsync({ id }));
                setConfirmCancel(false);
              }}
            >
              Cancel tournament
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {detail.name}?</DialogTitle>
            <DialogDescription>
              This permanently removes the tournament, its participants, rounds, and results. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteTournament.isPending}
              onClick={async () => {
                await run(async () => {
                  await deleteTournament.mutateAsync(id);
                  await navigate({ to: "/tournaments" });
                });
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsLayout>
  );
}

/**
 * Host reassignment, shown to the host only. Lets them move the tournament
 * between a personal host (themselves) and any organization they belong to.
 * @returns The host-picker card.
 */
function HostSection({ detail, locked }: { detail: TournamentDetailResponse; locked: boolean }) {
  const { data } = useMyOrganizations();
  const updateTournament = useUpdateTournament();
  const currentValue = detail.host.type === "user" ? "user" : (detail.host.orgId ?? "user");
  const hostItems = [
    { value: "user", label: "You (personal)" },
    ...data.items.map((org) => ({ value: org.id, label: org.name })),
  ];

  async function changeHost(value: string) {
    const host =
      value === "user"
        ? ({ type: "user" } as const)
        : ({ type: "organization", orgId: value } as const);
    try {
      await updateTournament.mutateAsync({ id: detail.id, host });
      toast.success("Host updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    }
  }

  return (
    <Card id="host" className="scroll-mt-16">
      <CardHeader>
        <CardTitle>Host</CardTitle>
        <CardDescription>
          Who can run this tournament. An organization brings in its owners, managers, and judges
          automatically. As a personal host, that is just you. You can invite extra staff either
          way.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Select
          items={hostItems}
          value={currentValue}
          disabled={locked || updateTournament.isPending}
          onValueChange={(value) => {
            if (value && value !== currentValue) {
              void changeHost(value);
            }
          }}
        >
          <SelectTrigger className="max-w-sm" aria-label="Host">
            <SelectValue placeholder="Host" />
          </SelectTrigger>
          <SelectContent>
            {hostItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}
