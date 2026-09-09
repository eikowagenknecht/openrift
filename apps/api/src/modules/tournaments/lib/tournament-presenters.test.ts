import { describe, expect, it } from "vitest";

import type {
  Organization,
  OrganizationMemberWithName,
  OrganizationSummary,
} from "../repositories/organizations.js";
import type { TournamentParticipantWithUser } from "../repositories/tournaments-participants.js";
import type { Tournament } from "../repositories/tournaments-shared.js";
import type { TournamentStaffWithName } from "../repositories/tournaments-staff.js";
import {
  moduleFlags,
  toOrganizationMember,
  toOrganizationResponse,
  toOrganizationSummary,
  toParticipant,
  toStaffMember,
} from "./tournament-presenters.js";

const createdAt = new Date("2026-06-01T10:00:00.000Z");
const updatedAt = new Date("2026-06-02T11:30:00.000Z");

function org(overrides: Partial<Organization> = {}): Organization {
  return {
    id: "org-1",
    slug: "lgs-store",
    name: "LGS Store",
    description: null,
    createdAt,
    updatedAt,
    ...overrides,
  };
}

function participant(
  overrides: Partial<TournamentParticipantWithUser> = {},
): TournamentParticipantWithUser {
  return {
    id: "p-1",
    tournamentId: "t-1",
    userId: null,
    userName: null,
    displayName: "Walk-in Wendy",
    riotId: null,
    status: "active",
    droppedAfterRound: null,
    seed: null,
    claimSource: null,
    claimToken: "claim-tok-abc",
    claimedAt: null,
    claimBlockedAt: null,
    fixedTable: null,
    region: null,
    legendCardId: null,
    legendName: null,
    groupId: null,
    groupSlot: null,
    groupLabel: null,
    teamId: null,
    createdAt,
    updatedAt,
    ...overrides,
  };
}

describe("toOrganizationResponse", () => {
  it("maps the row and serializes timestamps to ISO", () => {
    expect(toOrganizationResponse(org({ description: "Local shop" }))).toEqual({
      id: "org-1",
      slug: "lgs-store",
      name: "LGS Store",
      description: "Local shop",
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    });
  });
});

describe("toOrganizationSummary", () => {
  it("folds in the owner name and member count", () => {
    const row: OrganizationSummary = { ...org(), ownerName: "Olivia", memberCount: 4 };
    const result = toOrganizationSummary(row);
    expect(result.ownerName).toBe("Olivia");
    expect(result.memberCount).toBe(4);
    expect(result.id).toBe("org-1");
  });
});

describe("toOrganizationMember", () => {
  it("maps a member row with an ISO joinedAt", () => {
    const row: OrganizationMemberWithName = {
      userId: "user-2",
      name: "Manny",
      role: "manager",
      joinedAt: createdAt,
    };
    expect(toOrganizationMember(row)).toEqual({
      userId: "user-2",
      name: "Manny",
      role: "manager",
      joinedAt: createdAt.toISOString(),
    });
  });
});

describe("toStaffMember", () => {
  it("marks an explicit grant with a null org role", () => {
    const row: TournamentStaffWithName = {
      userId: "user-3",
      name: "Judy Judge",
      role: "judge",
      addedAt: createdAt,
    };
    expect(toStaffMember(row)).toEqual({
      userId: "user-3",
      name: "Judy Judge",
      role: "judge",
      source: "grant",
      orgRole: null,
      addedAt: createdAt.toISOString(),
    });
  });
});

describe("toParticipant", () => {
  it("exposes the claim token for an unclaimed, unblocked spot", () => {
    expect(toParticipant(participant()).claimToken).toBe("claim-tok-abc");
  });

  it("hides the claim token once the spot is linked to an account", () => {
    const result = toParticipant(participant({ userId: "user-9", userName: "Linked Larry" }));
    expect(result.claimToken).toBeNull();
  });

  it("hides the claim token and flags claimBlocked when a judge unlinked it", () => {
    const result = toParticipant(participant({ claimBlockedAt: updatedAt }));
    expect(result.claimToken).toBeNull();
    expect(result.claimBlocked).toBe(true);
  });

  it("serializes timestamps and carries the lifecycle status through", () => {
    const result = toParticipant(participant({ status: "dropped", droppedAfterRound: 2 }));
    expect(result.status).toBe("dropped");
    expect(result.droppedAfterRound).toBe(2);
    expect(result.createdAt).toBe(createdAt.toISOString());
  });
});

describe("moduleFlags", () => {
  it("derives pairing and deck-submission flags from the columns", () => {
    const flags = moduleFlags({
      pairingStyle: "pod",
      deckSubmission: "required",
    } as unknown as Tournament);
    expect(flags).toEqual({ pairing: true, deckSubmission: true });
  });

  it("treats 'none' as the module being off", () => {
    const flags = moduleFlags({
      pairingStyle: "none",
      deckSubmission: "none",
    } as unknown as Tournament);
    expect(flags).toEqual({ pairing: false, deckSubmission: false });
  });
});
