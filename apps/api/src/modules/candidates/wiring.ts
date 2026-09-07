import type { Kysely } from "kysely";

import type { Database } from "../../db/index.js";
import { candidateCardsRepo } from "./repositories/candidate-cards.js";
import { cardSubmissionsRepo } from "./repositories/card-submissions.js";
import { ignoredCandidatesRepo } from "./repositories/ignored-candidates.js";
import { ingestRepo } from "./repositories/ingest.js";
import { notifyAdminsOfCardSubmission } from "./services/card-submission-notifications.js";
import type { CardSubmissionEmailDeps } from "./services/card-submission-notifications.js";
import { importErrata } from "./services/import-errata.js";
import { ingestCandidates } from "./services/ingest-candidates.js";
import { ingestUserSubmission } from "./services/ingest-user-submission.js";

export interface CandidatesRepos {
  cardSubmissions: ReturnType<typeof cardSubmissionsRepo>;
  candidateCards: ReturnType<typeof candidateCardsRepo>;
  ignoredCandidates: ReturnType<typeof ignoredCandidatesRepo>;
  ingest: ReturnType<typeof ingestRepo>;
}

export interface CandidatesServices {
  ingestCandidates: typeof ingestCandidates;
  ingestUserSubmission: typeof ingestUserSubmission;
  importErrata: typeof importErrata;
  notifyAdminsOfCardSubmission: typeof notifyAdminsOfCardSubmission;
}

export function createCandidatesRepos(db: Kysely<Database>): CandidatesRepos {
  return {
    cardSubmissions: cardSubmissionsRepo(db),
    candidateCards: candidateCardsRepo(db),
    ignoredCandidates: ignoredCandidatesRepo(db),
    ingest: ingestRepo(db),
  };
}

export function createCandidatesServices(emailDeps?: CardSubmissionEmailDeps): CandidatesServices {
  return {
    ingestCandidates,
    ingestUserSubmission,
    importErrata,
    notifyAdminsOfCardSubmission:
      emailDeps === undefined
        ? notifyAdminsOfCardSubmission
        : (repos, submission) => notifyAdminsOfCardSubmission(repos, submission, emailDeps),
  };
}
