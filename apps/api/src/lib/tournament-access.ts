import { ERROR_CODES } from "@openrift/shared";
import type { TournamentHostType } from "@openrift/shared";

import type { Repos } from "../deps.js";
import { AppError } from "../errors.js";
import type { PodTournament } from "../repositories/pod-tournaments.js";
import type { Tournament, TournamentParticipant } from "../repositories/tournaments.js";
import { hasOrgRole, loadOrg, requireOrgRole } from "./org-access.js";

/**
 * Loaders and authorization gates for the tournaments umbrella (ADR-033),
 * mirroring {@link import("./group-access.js")} for friend groups. Authority
 * composes host standing (the hosting user, or an org owner/manager) with
 * `tournament_staff` grants; every route-level gate resolves through here.
 */

/**
 * Loads the tournament; 404 if missing.
 * @returns The tournament row.
 */
export async function loadTournament(repos: Repos, id: string): Promise<Tournament> {
  const tournament = await repos.tournaments.findById(id);
  if (!tournament) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Tournament not found");
  }
  return tournament;
}

/**
 * Loads the pod-engine view of the tournament (404 if missing). The engine
 * functions and the run-detail builder need the `PodTournament`-typed row from
 * the pod repo, not the unified `Tournament` row.
 * @returns The pod tournament row.
 */
export async function loadPodTournament(repos: Repos, id: string): Promise<PodTournament> {
  const tournament = await repos.podTournaments.findById(id);
  if (!tournament) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Tournament not found");
  }
  return tournament;
}

/** @returns Whether the user is the hosting user, or an owner/manager of the host org. */
export async function isHost(
  repos: Repos,
  tournament: Tournament,
  userId: string,
): Promise<boolean> {
  if (tournament.hostType === "user") {
    return tournament.hostUserId === userId;
  }
  if (tournament.hostOrgId) {
    const membership = await repos.organizations.getMembership(tournament.hostOrgId, userId);
    // Org judges have no host authority; only owners/managers host for the org.
    return membership !== undefined && hasOrgRole(membership.role, "manager");
  }
  return false;
}

/** The host column triple, kept mutually exclusive so the host CHECK holds. */
export interface TournamentHostColumns {
  hostType: TournamentHostType;
  hostUserId: string | null;
  hostOrgId: string | null;
}

/**
 * Resolves an organization host for a create or a host reassignment: 404 on an
 * unknown org, 403 unless the caller is an owner or manager of it.
 * @param repos The repository bundle.
 * @param orgId The organization to host under.
 * @param userId The acting user.
 * @returns The host columns for that org.
 */
export async function resolveOrgHost(
  repos: Repos,
  orgId: string,
  userId: string,
): Promise<TournamentHostColumns> {
  const org = await loadOrg(repos, orgId, "Host organization not found");
  await requireOrgRole(repos, org.id, userId, "manager");
  return { hostType: "organization", hostUserId: null, hostOrgId: org.id };
}

/** Throws 403 unless the user is the host or an organizer (the manage gate). */
export async function requireManage(
  repos: Repos,
  tournament: Tournament,
  userId: string,
): Promise<void> {
  const allowed = await repos.tournaments.isHostOrStaff(tournament.id, userId, ["organizer"]);
  if (!allowed) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Host or organizer only");
  }
}

/**
 * Throws 403 unless the user works the event (host, organizer, or judge). Looser
 * than {@link requireManage}: a judge can add a walk-in (ADR-033 decision 18 — a
 * judge/host manual add is a trusted, auto-active roster path) without gaining
 * the rest of the management surface.
 */
export async function requireStaff(
  repos: Repos,
  tournament: Tournament,
  userId: string,
): Promise<void> {
  const allowed = await repos.tournaments.isHostOrStaff(tournament.id, userId, [
    "organizer",
    "judge",
  ]);
  if (!allowed) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Host, organizer, or judge only");
  }
}

/** Throws 403 unless the user is the host (the host-only gate). */
export async function requireHost(
  repos: Repos,
  tournament: Tournament,
  userId: string,
): Promise<void> {
  if (!(await isHost(repos, tournament, userId))) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN, "Host only");
  }
}

/**
 * Loads a participant and asserts it belongs to the tournament; 404 otherwise.
 * @returns The participant row.
 */
export async function loadParticipant(
  repos: Repos,
  tournamentId: string,
  participantId: string,
): Promise<TournamentParticipant> {
  const participant = await repos.tournaments.findParticipantById(participantId);
  if (!participant || participant.tournamentId !== tournamentId) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Participant not found");
  }
  return participant;
}
