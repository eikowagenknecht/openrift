import type { Kysely } from "kysely";

import type { Database } from "../../db/tables.js";
import { metaOverlaysRepo } from "./repositories/meta-overlays.js";
import { metaPlayerLinksRepo } from "./repositories/meta-player-links.js";
import { metaSubmissionsRepo } from "./repositories/meta-submissions.js";
import { metaRepo } from "./repositories/meta.js";
import { playloltcgEventsRepo } from "./repositories/playloltcg-events.js";
import { playloltcgResultsRepo } from "./repositories/playloltcg-results.js";
import { topdeckEventsRepo } from "./repositories/topdeck-events.js";
import { topdeckResultsRepo } from "./repositories/topdeck-results.js";
import { uvsgamesEventsRepo } from "./repositories/uvsgames-events.js";
import { uvsgamesResultsRepo } from "./repositories/uvsgames-results.js";
import { ingestMetaOverlays } from "./services/ingest-meta-overlays.js";
import {
  suggestMetaEventMatches,
  suggestMetaPlayerMatches,
} from "./services/meta-match-suggestions.js";
import {
  acceptMetaEventOverlay,
  acceptMetaPlayerOverlay,
  acceptMetaPlayerOverlays,
  rejectMetaOverlay,
} from "./services/meta-overlay-review.js";
import { promoteMetaEvent, promoteNewEvent } from "./services/meta-promote.js";
import { repromoteMetaEvents } from "./services/meta-repromote.js";
import { retierMetaEvents } from "./services/meta-retier.js";
import { submitMetaDeck, submitMetaEventCorrection } from "./services/meta-submission.js";

export interface MetaRepos {
  meta: ReturnType<typeof metaRepo>;
  metaOverlays: ReturnType<typeof metaOverlaysRepo>;
  metaPlayerLinks: ReturnType<typeof metaPlayerLinksRepo>;
  uvsgamesEvents: ReturnType<typeof uvsgamesEventsRepo>;
  uvsgamesResults: ReturnType<typeof uvsgamesResultsRepo>;
  playloltcgEvents: ReturnType<typeof playloltcgEventsRepo>;
  playloltcgResults: ReturnType<typeof playloltcgResultsRepo>;
  topdeckEvents: ReturnType<typeof topdeckEventsRepo>;
  topdeckResults: ReturnType<typeof topdeckResultsRepo>;
  metaSubmissions: ReturnType<typeof metaSubmissionsRepo>;
}

export interface MetaServices {
  ingestMetaOverlays: typeof ingestMetaOverlays;
  promoteMetaEvent: typeof promoteMetaEvent;
  promoteNewEvent: typeof promoteNewEvent;
  repromoteMetaEvents: typeof repromoteMetaEvents;
  retierMetaEvents: typeof retierMetaEvents;
  acceptMetaEventOverlay: typeof acceptMetaEventOverlay;
  acceptMetaPlayerOverlay: typeof acceptMetaPlayerOverlay;
  acceptMetaPlayerOverlays: typeof acceptMetaPlayerOverlays;
  rejectMetaOverlay: typeof rejectMetaOverlay;
  suggestMetaEventMatches: typeof suggestMetaEventMatches;
  suggestMetaPlayerMatches: typeof suggestMetaPlayerMatches;
  submitMetaDeck: typeof submitMetaDeck;
  submitMetaEventCorrection: typeof submitMetaEventCorrection;
}

export function createMetaRepos(db: Kysely<Database>): MetaRepos {
  return {
    meta: metaRepo(db),
    metaOverlays: metaOverlaysRepo(db),
    metaPlayerLinks: metaPlayerLinksRepo(db),
    uvsgamesEvents: uvsgamesEventsRepo(db),
    uvsgamesResults: uvsgamesResultsRepo(db),
    playloltcgEvents: playloltcgEventsRepo(db),
    playloltcgResults: playloltcgResultsRepo(db),
    topdeckEvents: topdeckEventsRepo(db),
    topdeckResults: topdeckResultsRepo(db),
    metaSubmissions: metaSubmissionsRepo(db),
  };
}

export function createMetaServices(): MetaServices {
  return {
    ingestMetaOverlays,
    promoteMetaEvent,
    promoteNewEvent,
    repromoteMetaEvents,
    retierMetaEvents,
    acceptMetaEventOverlay,
    acceptMetaPlayerOverlay,
    acceptMetaPlayerOverlays,
    rejectMetaOverlay,
    suggestMetaEventMatches,
    suggestMetaPlayerMatches,
    submitMetaDeck,
    submitMetaEventCorrection,
  };
}
