import type { TournamentDetailResponse } from "@openrift/shared/types/api/tournament";
import { Suspense } from "react";

import type { PageTocItem } from "@/components/layout/page-toc";
import { SettingsGroup } from "@/components/layout/settings-group";
import { SettingsLayout } from "@/components/layout/settings-layout";
import { DangerZoneCard } from "@/components/tournaments/settings/danger-zone-card";
import { DecksCard } from "@/components/tournaments/settings/decks-card";
import { FollowAlongCard } from "@/components/tournaments/settings/follow-along-card";
import { FormatCard } from "@/components/tournaments/settings/format-card";
import { GroupCard } from "@/components/tournaments/settings/group-card";
import { HostCard } from "@/components/tournaments/settings/host-card";
import { NameCard } from "@/components/tournaments/settings/name-card";
import { PointsCard } from "@/components/tournaments/settings/points-card";
import { RegionsCard } from "@/components/tournaments/settings/regions-card";
import { ScheduleCard } from "@/components/tournaments/settings/schedule-card";
import { SignupLinksCard } from "@/components/tournaments/settings/signup-links-card";
import { effectiveTournamentState, hasPairing } from "@/lib/tournament-display";

function buildTocItems({
  isHost,
  runsRounds,
}: {
  isHost: boolean;
  runsRounds: boolean;
}): PageTocItem[] {
  return [
    { id: "general", label: "General" },
    { id: "name", label: "Name", level: 1 },
    ...(isHost
      ? [
          { id: "host", label: "Host", level: 1 },
          { id: "group", label: "Group", level: 1 },
        ]
      : []),
    { id: "schedule", label: "Schedule", level: 1 },
    { id: "pairings-decks", label: "Pairings & decks" },
    { id: "pairings", label: "Format", level: 1 },
    ...(runsRounds
      ? [
          { id: "points", label: "Points", level: 1 },
          { id: "regions", label: "Regions", level: 1 },
        ]
      : []),
    { id: "decks", label: "Decks", level: 1 },
    { id: "sharing", label: "Sharing" },
    { id: "signup-links", label: "Sign-up links", level: 1 },
    ...(runsRounds ? [{ id: "follow-along", label: "Follow-along", level: 1 }] : []),
    { id: "danger-zone", label: "Danger zone" },
  ];
}

export function TournamentSettingsTab({ detail }: { detail: TournamentDetailResponse }) {
  const runsRounds = hasPairing(detail.pairingStyle);
  const isHost = detail.myRoles.includes("host");
  const effectiveState = effectiveTournamentState(detail.startsAt, detail.endsAt, detail.status);
  const locked = effectiveState === "cancelled";
  const canEndEarly = effectiveState !== "completed" && effectiveState !== "cancelled";

  return (
    <SettingsLayout toc={buildTocItems({ isHost, runsRounds })}>
      <SettingsGroup id="general" title="General">
        <NameCard detail={detail} locked={locked} />

        {isHost ? (
          <Suspense fallback={null}>
            <HostCard detail={detail} locked={locked} />
            <GroupCard detail={detail} locked={locked} />
          </Suspense>
        ) : null}

        <ScheduleCard detail={detail} locked={locked} canEndEarly={canEndEarly} />
      </SettingsGroup>

      <SettingsGroup id="pairings-decks" title="Pairings & decks">
        <FormatCard detail={detail} locked={locked} />
        {runsRounds ? <PointsCard detail={detail} locked={locked} /> : null}
        {runsRounds && detail.playMode !== "2v2" ? (
          <RegionsCard detail={detail} locked={locked} />
        ) : null}
        <DecksCard detail={detail} locked={locked} />
      </SettingsGroup>

      <SettingsGroup id="sharing" title="Sharing">
        <SignupLinksCard detail={detail} locked={locked} />
        {runsRounds ? <FollowAlongCard detail={detail} locked={locked} /> : null}
      </SettingsGroup>

      <SettingsGroup id="danger-zone" title="Danger zone">
        <DangerZoneCard detail={detail} />
      </SettingsGroup>
    </SettingsLayout>
  );
}
