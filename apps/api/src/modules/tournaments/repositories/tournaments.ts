import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";
import { tournamentsCoreRepo } from "./tournaments-core.js";
import { tournamentLookupsRepo } from "./tournaments-lookups.js";
import { tournamentParticipantsRepo } from "./tournaments-participants.js";
import { tournamentStaffRepo } from "./tournaments-staff.js";

/**
 * Authorization composes host authority (the hosting user, or an
 * organization's owner/manager) with per-tournament `tournament_staff` grants.
 * The repo is naive about who is calling; the route composes the checks.
 */
export function tournamentsRepo(db: Kysely<Database>) {
  return {
    ...tournamentsCoreRepo(db),
    ...tournamentParticipantsRepo(db),
    ...tournamentStaffRepo(db),
    ...tournamentLookupsRepo(db),
  };
}
