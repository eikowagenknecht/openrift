import { ERROR_CODES } from "@openrift/shared";
import type {
  MetaSource,
  MetaSyncTriggerResult,
} from "@openrift/shared/contracts/admin/meta-catalog";
import {
  adminMetaCatalogContract,
  isCatalogCheckpoint,
  isResumableCheckpoint,
} from "@openrift/shared/contracts/admin/meta-catalog";
import { createLogger } from "@openrift/shared/logger";
import { implement } from "@orpc/server";

import { cronJobs } from "../../cron-jobs.js";
import { AppError } from "../../errors.js";
import { toMetaCatalogRow, toMetaSourceTemplate } from "../../lib/meta-catalog-presenters.js";
import { toPlayloltcgCatalogRow } from "../../lib/playloltcg-catalog-presenters.js";
import { PLAYLOLTCG_PROVIDER } from "../../lib/playloltcg-catalog.js";
import { UVSGAMES_PROVIDER } from "../../lib/uvsgames-catalog.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import type { UvsgamesListRow } from "../../repositories/uvsgames-events.js";
import { repromoteMetaEvents } from "../../services/meta-repromote.js";
import type { MetaSyncDeps, PlayloltcgSyncDeps } from "../../services/meta-sync/index.js";
import {
  acceptCatalogEvent,
  backfillCatalog,
  createMetaSyncDeps,
  deepFetchEvent,
  isCatalogSyncNoop,
  isRecheckNoop,
  META_JOB_KINDS,
  processRechecks,
  RECHECK_BATCH_SIZE,
  syncCatalog,
  acceptPlayloltcgEvent,
  backfillPlayloltcg,
  createPlayloltcgSyncDeps,
  isPlayloltcgRecheckNoop,
  isPlayloltcgSyncNoop,
  PLAYLOLTCG_RECHECK_BATCH_SIZE,
  processPlayloltcgRechecks,
  syncPlayloltcgCatalog,
} from "../../services/meta-sync/index.js";
import { recordAdminEvent } from "../../services/record-admin-event.js";
import { runJobAsync, runJobOutcome } from "../../services/run-job.js";

const log = createLogger("meta-sync");

const os = implement(adminMetaCatalogContract).$context<ApiContext>().use(requireAuthedUser);

const DEFAULT_LIMIT = 50;

/** The kinds each source's backfill resume point and cancel flag live under. */
const BACKFILL_KIND = "meta.uvsgames_backfill";
const PLAYLOLTCG_BACKFILL_KIND = "meta.playloltcg_backfill";

function playloltcgDeps(context: ApiContext): PlayloltcgSyncDeps {
  return createPlayloltcgSyncDeps({
    repos: context.repos,
    transact: context.transact,
    fetch: context.io.fetch,
    log,
    baseUrl: context.config.metaSync.playloltcgBaseUrl,
  });
}

/** How many of the selected source's runs the sync panel shows. */
const STATUS_RUN_LIMIT = 25;

/** The `meta_event_sources.provider` each catalogued source cites itself under. */
const SOURCE_PROVIDER: Record<MetaSource, string> = {
  uvsgames: UVSGAMES_PROVIDER,
  playloltcg: PLAYLOLTCG_PROVIDER,
};

/**
 * Both sources' crons write into the same `job_runs` table, so an unfiltered
 * newest-25 buries one source's backfill within a couple of hours of the
 * other's syncs, and with it the resume state the panel reads off that run.
 */
function jobKindsForSource(source: MetaSource): string[] {
  return META_JOB_KINDS.filter((kind) => kind.startsWith(`meta.${source}_`));
}

function syncDeps(context: ApiContext): MetaSyncDeps {
  return createMetaSyncDeps({
    repos: context.repos,
    transact: context.transact,
    fetch: context.io.fetch,
    log,
    baseUrl: context.config.metaSync.baseUrl,
  });
}

async function requireRow(context: ApiContext, externalId: string): Promise<UvsgamesListRow> {
  const row = await context.repos.uvsgamesEvents.byKey(externalId);
  if (row === undefined) {
    throw new AppError(404, ERROR_CODES.NOT_FOUND, "Catalogue event not found");
  }
  return row;
}

/**
 * The crawls answer with a run handle rather than their result: a full backfill
 * walks a thousand pages at one request per second, which outlives every
 * gateway in front of this. The caller polls `job_runs`.
 */
async function startJob<TDeps, TResult>(
  context: ApiContext,
  kind: string,
  makeDeps: (context: ApiContext) => TDeps,
  work: (deps: TDeps, runId?: string) => Promise<TResult>,
  classifyNoop?: (result: TResult) => boolean,
): Promise<MetaSyncTriggerResult> {
  const deps = makeDeps(context);
  const started = await runJobAsync(
    { repos: context.repos, log },
    kind,
    "admin",
    (runId) => work(deps, runId),
    { summarize: (result) => result, classifyNoop },
  );
  return { status: started.status, runId: started.runId, message: null, result: null };
}

function triggerResult(
  outcome: Awaited<ReturnType<typeof runJobOutcome<unknown>>>,
): MetaSyncTriggerResult {
  if (outcome.status === "succeeded") {
    return {
      status: "succeeded",
      runId: null,
      message: null,
      result: outcome.result as Record<string, unknown>,
    };
  }
  if (outcome.status === "already_running") {
    return { status: "already_running", runId: outcome.runId, message: null, result: null };
  }
  return { status: "failed", runId: null, message: outcome.message, result: null };
}

/**
 * The catalogue triage list and the sync controls (ADR-014), mounted under the
 * admin-gated `/api/admin/v1/meta` prefix.
 *
 * Accept and dismiss are the only two writes against a catalogue row, and
 * neither edits the mirror: accept mints the live event and promotes it,
 * dismiss writes the ignore key the ingest already honours. Everything else
 * here is either a read or a manual run of a job the crons own.
 */
export const adminMetaCatalogRouter = {
  list: os.list.handler(async ({ input, context }) => {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const page = input.page ?? 1;
    const [{ rows, total }, counts, formatMappings, watchedTemplates] = await Promise.all([
      context.repos.uvsgamesEvents.list(
        {
          search: input.search,
          displayStatus: input.displayStatus,
          decklistPublished: input.decklistPublished,
          minPlayers: input.minPlayers,
          dateFrom: input.dateFrom === undefined ? undefined : new Date(input.dateFrom),
          dateTo: input.dateTo === undefined ? undefined : new Date(input.dateTo),
          triage: input.triage,
          missing: input.missing,
          awaitingResults: input.awaitingResults,
        },
        { limit, offset: (page - 1) * limit },
        { sort: input.sort, direction: input.direction },
      ),
      context.repos.uvsgamesEvents.triageCounts(),
      context.repos.uvsgamesEvents.formatMappings(),
      context.repos.uvsgamesEvents.watchedTemplates(),
    ]);
    const vocabulary = { formatMappings, watchedTemplates };
    return {
      rows: rows.map((row) => toMetaCatalogRow(row, vocabulary)),
      total,
      page,
      limit,
      counts,
    };
  }),

  accept: os.accept.handler(async ({ input, context }) => {
    const row = await requireRow(context, input.externalId);
    const accepted = await acceptCatalogEvent(syncDeps(context), row, { format: input.format });
    await recordAdminEvent(context.repos, context.userId, {
      action: "meta-catalog.accept",
      entityType: "meta-catalog",
      entityId: `${UVSGAMES_PROVIDER}:${row.externalId}`,
      entityLabel: row.name,
      newValues: { metaEventId: accepted.metaEventId, slug: accepted.slug },
    });
    return accepted;
  }),

  dismiss: os.dismiss.handler(async ({ input, context }) => {
    const row = await requireRow(context, input.externalId);
    await context.repos.metaOverlays.ignoreEvent(UVSGAMES_PROVIDER, row.externalId);
    await recordAdminEvent(context.repos, context.userId, {
      action: "meta-catalog.dismiss",
      entityType: "meta-catalog",
      entityId: `${UVSGAMES_PROVIDER}:${row.externalId}`,
      entityLabel: row.name,
    });
  }),

  undismiss: os.undismiss.handler(async ({ input, context }) => {
    const removed = await context.repos.metaOverlays.unignoreEvent(
      UVSGAMES_PROVIDER,
      input.externalId,
    );
    if (!removed) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Ignore entry not found");
    }
    await recordAdminEvent(context.repos, context.userId, {
      action: "meta-catalog.undismiss",
      entityType: "meta-catalog",
      entityId: `${UVSGAMES_PROVIDER}:${input.externalId}`,
    });
  }),

  listTemplates: os.listTemplates.handler(async ({ context }) => {
    const rows = await context.repos.uvsgamesEvents.listTemplates();
    return { templates: rows.map((row) => toMetaSourceTemplate(row)) };
  }),

  // Templates are the sync's own rows, so this write never invents one: an
  // admin only says which of them to watch and what tier they map to.
  updateTemplate: os.updateTemplate.handler(async ({ input, context }) => {
    const patch = {
      ...(input.watched === undefined ? {} : { watched: input.watched }),
      ...(input.tier === undefined ? {} : { tier: input.tier }),
    };
    const row = await context.repos.uvsgamesEvents.updateTemplate(input.templateId, patch);
    if (row === undefined) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Unknown template");
    }
    if (Object.keys(patch).length > 0) {
      await recordAdminEvent(context.repos, context.userId, {
        action: "meta-catalog.template",
        entityType: "meta-catalog-template",
        entityId: input.templateId,
        entityLabel: row.sourceName ?? row.sampleEventName,
        newValues: patch,
      });
    }
    // A mapping edit is a rule change for exactly this template's events, so it
    // reapplies itself. An accepted overlay still wins whatever it claims,
    // because promotion applies those after the source either way.
    if (input.tier !== undefined) {
      await repromoteMetaEvents(context.repos, { templateId: input.templateId });
    }
    return toMetaSourceTemplate(row);
  }),

  listFormats: os.listFormats.handler(async ({ context }) => {
    const formats = await context.repos.uvsgamesEvents.listFormats();
    return { formats };
  }),

  updateFormat: os.updateFormat.handler(async ({ input, context }) => {
    if (input.mappedFormat !== null) {
      const known = await context.repos.deckFormats.getBySlug(input.mappedFormat);
      if (!known) {
        throw new AppError(
          400,
          ERROR_CODES.BAD_REQUEST,
          `Unknown deck format "${input.mappedFormat}"`,
        );
      }
    }
    const existing = await context.repos.uvsgamesEvents.formatByName(input.sourceFormat);
    if (existing === undefined) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "No catalogue event carries this format");
    }

    const updated = await context.repos.uvsgamesEvents.setFormatMapping(
      input.sourceFormat,
      input.mappedFormat,
    );
    if (updated === undefined) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "No catalogue event carries this format");
    }
    await recordAdminEvent(context.repos, context.userId, {
      action: "meta-catalog.format",
      entityType: "meta-catalog-format",
      entityId: input.sourceFormat,
      entityLabel: input.sourceFormat,
      oldValues: { mappedFormat: existing.mappedFormat },
      newValues: { mappedFormat: input.mappedFormat },
    });
    return updated;
  }),

  settings: os.settings.handler(async ({ context }) => {
    const row = await context.repos.uvsgamesEvents.settings();
    return { ...row, updatedAt: row.updatedAt.toISOString() };
  }),

  updateSettings: os.updateSettings.handler(async ({ input, context }) => {
    const row = await context.repos.uvsgamesEvents.updateSettings(input);
    await recordAdminEvent(context.repos, context.userId, {
      action: "meta-catalog.settings",
      entityType: "meta-catalog",
      entityId: UVSGAMES_PROVIDER,
      newValues: input,
    });
    return { ...row, updatedAt: row.updatedAt.toISOString() };
  }),

  syncStatus: os.syncStatus.handler(async ({ input, context }) => {
    const source = input.source;
    const sourceRepo =
      source === "playloltcg" ? context.repos.playloltcgEvents : context.repos.uvsgamesEvents;
    const [overview, archive, counts, runs] = await Promise.all([
      sourceRepo.syncOverview(),
      context.repos.meta.archiveOverview(SOURCE_PROVIDER[source]),
      sourceRepo.triageCounts(),
      context.repos.jobRuns.listRecentByKinds(jobKindsForSource(source), STATUS_RUN_LIMIT),
    ]);
    return {
      catalog: {
        total: overview.total,
        completed: overview.completed,
        decklistPublished: overview.decklistPublished,
        missing: overview.missing,
        queued: overview.queued,
        dueRecheck: overview.dueRecheck,
        acceptedAwaitingResults: overview.acceptedAwaitingResults,
        acceptedMissing: overview.acceptedMissing,
        lastSeenAt: overview.lastSeenAt?.toISOString() ?? null,
      },
      archive,
      counts,
      runs: runs.map((run) => ({
        id: run.id,
        kind: run.kind,
        trigger: run.trigger,
        status: run.status,
        startedAt: run.startedAt.toISOString(),
        finishedAt: run.finishedAt?.toISOString() ?? null,
        durationMs: run.durationMs,
        errorMessage: run.errorMessage,
        result: (run.result ?? null) as Record<string, unknown> | null,
      })),
      schedules: {
        "meta.uvsgames_sync": cronJobs.metaUvsgamesSync !== null,
        "meta.uvsgames_recheck": cronJobs.metaUvsgamesRecheck !== null,
        "meta.playloltcg_sync": cronJobs.metaPlayloltcgSync !== null,
        "meta.playloltcg_recheck": cronJobs.metaPlayloltcgRecheck !== null,
      },
    };
  }),

  runSync: os.runSync.handler(({ context }) =>
    startJob(context, "meta.uvsgames_sync", syncDeps, syncCatalog, isCatalogSyncNoop),
  ),

  runBackfill: os.runBackfill.handler(async ({ context }) => {
    // A full pass takes hours, so a run that stopped early (cancelled, out of
    // request budget, or killed with the process) leaves a resume point behind
    // and this picks it up. `restartBackfill` is the way to ignore it.
    const previous = await context.repos.jobRuns.findLatestForResume(BACKFILL_KIND);
    const prior = previous?.result;
    const resumeFrom = isResumableCheckpoint(prior) ? new Date(prior.coveredThrough) : undefined;
    return await startJob(
      context,
      BACKFILL_KIND,
      syncDeps,
      (deps, runId) => backfillCatalog(deps, runId, { resumeFrom }),
      isCatalogSyncNoop,
    );
  }),

  restartBackfill: os.restartBackfill.handler(({ context }) =>
    startJob(
      context,
      BACKFILL_KIND,
      syncDeps,
      (deps, runId) => backfillCatalog(deps, runId),
      isCatalogSyncNoop,
    ),
  ),

  cancelRun: os.cancelRun.handler(async ({ input, context }) => {
    const { source, job } = input;
    if (source === "playloltcg" && job === "recheck") {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        "The playloltcg recheck cannot be stopped: it runs without a run id, so nothing there reads the flag.",
      );
    }
    // Typed against the job list so a new source or job that has no run kind
    // fails here rather than 404ing at runtime.
    const kind: (typeof META_JOB_KINDS)[number] = `meta.${source}_${job}`;
    const running = await context.repos.jobRuns.findRunning(kind);
    if (!running) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `No ${job} is running`);
    }
    // A recheck never writes a crawl checkpoint, so only the backfill has a
    // shape to wait for here.
    if (job === "backfill") {
      const current = await context.repos.jobRuns.getResult(running.id);
      if (!isCatalogCheckpoint(current)) {
        // The crawl has not written its first heartbeat yet, so there is
        // nothing for it to read the flag out of. A retry in a few seconds
        // lands.
        throw new AppError(
          409,
          ERROR_CODES.CONFLICT,
          "Job is still initializing. Try again shortly.",
        );
      }
    }
    await context.repos.jobRuns.requestCancel(running.id);
    return { runId: running.id, cancelRequested: true as const };
  }),

  runRecheck: os.runRecheck.handler(({ context }) =>
    startJob(
      context,
      "meta.uvsgames_recheck",
      syncDeps,
      (deps, runId) => processRechecks(deps, RECHECK_BATCH_SIZE, runId),
      isRecheckNoop,
    ),
  ),

  runPlayloltcgSync: os.runPlayloltcgSync.handler(({ context }) =>
    startJob(
      context,
      "meta.playloltcg_sync",
      playloltcgDeps,
      syncPlayloltcgCatalog,
      isPlayloltcgSyncNoop,
    ),
  ),

  runPlayloltcgRecheck: os.runPlayloltcgRecheck.handler(({ context }) =>
    startJob(
      context,
      "meta.playloltcg_recheck",
      playloltcgDeps,
      (deps) => processPlayloltcgRechecks(deps, PLAYLOLTCG_RECHECK_BATCH_SIZE),
      isPlayloltcgRecheckNoop,
    ),
  ),

  runPlayloltcgBackfill: os.runPlayloltcgBackfill.handler(async ({ context }) => {
    const previous = await context.repos.jobRuns.findLatestForResume(PLAYLOLTCG_BACKFILL_KIND);
    const prior = previous?.result;
    const resumeFrom = isResumableCheckpoint(prior) ? new Date(prior.coveredThrough) : undefined;
    return await startJob(
      context,
      PLAYLOLTCG_BACKFILL_KIND,
      playloltcgDeps,
      (deps, runId) => backfillPlayloltcg(deps, runId, { resumeFrom }),
      isPlayloltcgSyncNoop,
    );
  }),

  restartPlayloltcgBackfill: os.restartPlayloltcgBackfill.handler(({ context }) =>
    startJob(
      context,
      PLAYLOLTCG_BACKFILL_KIND,
      playloltcgDeps,
      (deps, runId) => backfillPlayloltcg(deps, runId),
      isPlayloltcgSyncNoop,
    ),
  ),

  playloltcgList: os.playloltcgList.handler(async ({ input, context }) => {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const page = input.page ?? 1;
    const [{ rows, total }, counts] = await Promise.all([
      context.repos.playloltcgEvents.list(
        { search: input.search, triage: input.triage },
        { limit, offset: (page - 1) * limit },
      ),
      context.repos.playloltcgEvents.triageCounts(),
    ]);
    return { rows: rows.map((row) => toPlayloltcgCatalogRow(row)), total, page, limit, counts };
  }),

  playloltcgAccept: os.playloltcgAccept.handler(async ({ input, context }) => {
    const row = await context.repos.playloltcgEvents.byKey(input.activityShopId);
    if (row === undefined) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Catalogue event not found");
    }
    const accepted = await acceptPlayloltcgEvent(playloltcgDeps(context), row);
    await recordAdminEvent(context.repos, context.userId, {
      action: "meta-catalog.accept",
      entityType: "meta-catalog",
      entityId: `${PLAYLOLTCG_PROVIDER}:${row.activityShopId}`,
      entityLabel: row.name,
      newValues: { metaEventId: accepted.metaEventId, slug: accepted.slug },
    });
    return accepted;
  }),

  playloltcgDismiss: os.playloltcgDismiss.handler(async ({ input, context }) => {
    const row = await context.repos.playloltcgEvents.byKey(input.activityShopId);
    if (row === undefined) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Catalogue event not found");
    }
    await context.repos.metaOverlays.ignoreEvent(PLAYLOLTCG_PROVIDER, String(row.activityShopId));
    await recordAdminEvent(context.repos, context.userId, {
      action: "meta-catalog.dismiss",
      entityType: "meta-catalog",
      entityId: `${PLAYLOLTCG_PROVIDER}:${row.activityShopId}`,
      entityLabel: row.name,
    });
  }),

  // Five requests and a transform, so this one waits and hands back what it
  // found — the admin clicked it to see the result, not to poll for it.
  fetchEvent: os.fetchEvent.handler(async ({ input, context }) => {
    const row = await requireRow(context, input.externalId);
    if (row.metaEventId === null) {
      throw new AppError(
        400,
        ERROR_CODES.BAD_REQUEST,
        "Accept this event before fetching its results.",
      );
    }
    const deps = syncDeps(context);
    const outcome = await runJobOutcome<unknown>(
      { repos: context.repos, log },
      "meta.uvsgames_event_fetch",
      "admin",
      (runId) => deepFetchEvent(deps, row, runId),
      { summarize: (result) => result },
    );
    return triggerResult(outcome);
  }),
};
