import type {
  MetaCancellableJob,
  MetaCatalogTriage,
  MetaSource,
} from "@openrift/shared/contracts/admin/meta-catalog";

/** The tab a funnel stage or an alert opens, with its catalogue pre-filter. */
export interface MetaAdminTarget {
  tab?: "catalogue" | "review" | "public";
  triage?: MetaCatalogTriage;
  missing?: boolean;
  awaitingResults?: boolean;
}

/** Every catalogue link must name its source; both sources render at once. */
export function catalogueSource(source: MetaSource): MetaSource | undefined {
  return source === "uvsgames" ? undefined : source;
}

const META_SYNC_TRIGGERS = [
  "runSync",
  "runBackfill",
  "restartBackfill",
  "runRecheck",
  "runIdSweep",
  "runAutoAccept",
  "runRetier",
  "runRepromote",
  "runPlayloltcgSync",
  "runPlayloltcgRecheck",
  "runPlayloltcgAutoAccept",
  "runPlayloltcgBackfill",
  "restartPlayloltcgBackfill",
  "runTopdeckSync",
  "runTopdeckAutoAccept",
  "runTopdeckBackfill",
  "restartTopdeckBackfill",
] as const;

export type MetaSyncTrigger = (typeof META_SYNC_TRIGGERS)[number];

export interface TriggerEntry {
  trigger: MetaSyncTrigger;
  label: string;
  description: string;
  scheduleKey?: string;
  stop?: { job: MetaCancellableJob; label: string; description: string };
  confirm?: { title: string; body: (pending: number | null) => string; action: string };
}

const AUTO_ACCEPT_DESCRIPTION =
  "Runs the auto-accept rules over every event still awaiting triage. A sync only judges the events it just crawled, so this is how a rule you just turned on reaches the rest.";

const AUTO_ACCEPT_CONFIRM = {
  title: "Auto-accept the whole backlog?",
  body: (pending: number | null) =>
    `The current rules run over ${pending === null ? "every event" : `all ${pending.toLocaleString()} events`} awaiting triage, and every match becomes a live archive event. Dismissed events are left alone, but nothing takes an accept back in bulk.`,
  action: "Run the sweep",
};

const ID_SWEEP_DESCRIPTION =
  "Asks the source about event ids the listing never returns, which is the only way to reach an unlisted or cancelled event. One request per id, so a run takes a bounded slice and the next one carries on.";

const ID_SWEEP_CONFIRM = {
  title: "Sweep event ids?",
  body: () =>
    "The sweep spends one request per id, up to 5,000 in a run, against a source the rest of the pipeline asks a few hundred times a week. Nothing is ever asked about twice, so stopping and continuing later costs nothing.",
  action: "Run the sweep",
};

export const TRIGGER_GROUPS: Record<MetaSource, TriggerEntry[]> = {
  uvsgames: [
    {
      trigger: "runSync",
      label: "Sync the catalogue",
      description: "Crawls the last 7 days and everything upcoming.",
      scheduleKey: "meta.uvsgames_sync",
    },
    {
      trigger: "runAutoAccept",
      label: "Auto-accept backlog",
      description: AUTO_ACCEPT_DESCRIPTION,
      confirm: AUTO_ACCEPT_CONFIRM,
    },
    {
      trigger: "runRecheck",
      label: "Fetch results",
      description: "Pulls standings and decklists for accepted events that are due.",
      scheduleKey: "meta.uvsgames_recheck",
      stop: {
        job: "recheck",
        label: "Stop fetching results",
        description:
          "A results fetch is running. Stopping keeps every event it already pulled, and the next run picks up the ones still due.",
      },
    },
    {
      trigger: "runIdSweep",
      label: "Sweep event ids",
      description: ID_SWEEP_DESCRIPTION,
      confirm: ID_SWEEP_CONFIRM,
      stop: {
        job: "id_sweep",
        label: "Stop the id sweep",
        description:
          "A sweep is running. Stopping keeps every id it already decided, and the next run carries on with the ones it has not asked about.",
      },
    },
  ],
  playloltcg: [
    {
      trigger: "runPlayloltcgSync",
      label: "Sync the catalogue",
      description: "Crawls the last 7 days and everything upcoming.",
      scheduleKey: "meta.playloltcg_sync",
    },
    {
      trigger: "runPlayloltcgAutoAccept",
      label: "Auto-accept backlog",
      description: AUTO_ACCEPT_DESCRIPTION,
      confirm: AUTO_ACCEPT_CONFIRM,
    },
    {
      trigger: "runPlayloltcgRecheck",
      label: "Fetch results",
      description: "Pulls standings and decklists for accepted events that are due.",
      scheduleKey: "meta.playloltcg_recheck",
    },
  ],
  topdeck: [
    {
      trigger: "runTopdeckSync",
      label: "Sync the catalogue",
      description:
        "Reads the last 30 days of each format, with standings and decklists. There is no separate results fetch: one search carries them.",
      scheduleKey: "meta.topdeck_sync",
    },
    {
      trigger: "runTopdeckAutoAccept",
      label: "Auto-accept backlog",
      description: AUTO_ACCEPT_DESCRIPTION,
      confirm: AUTO_ACCEPT_CONFIRM,
    },
  ],
};

export const BACKFILL_TRIGGERS_BY_SOURCE: Record<
  MetaSource,
  Record<"idle" | "resumable", TriggerEntry[]>
> = {
  uvsgames: {
    idle: [
      {
        trigger: "runBackfill",
        label: "Full backfill",
        description: "Crawls the source's full history, resuming where the last run stopped.",
      },
    ],
    resumable: [
      {
        trigger: "runBackfill",
        label: "Continue backfill",
        description: "Picks up where the last one stopped.",
      },
      {
        trigger: "restartBackfill",
        label: "Backfill from scratch",
        description: "The same crawl from day one, ignoring the resume point.",
      },
    ],
  },
  playloltcg: {
    idle: [
      {
        trigger: "runPlayloltcgBackfill",
        label: "Full backfill",
        description: "Crawls the source's full history, resuming where the last run stopped.",
      },
    ],
    resumable: [
      {
        trigger: "runPlayloltcgBackfill",
        label: "Continue backfill",
        description: "Picks up where the last one stopped.",
      },
      {
        trigger: "restartPlayloltcgBackfill",
        label: "Backfill from scratch",
        description: "The same crawl from day one, ignoring the resume point.",
      },
    ],
  },
  topdeck: {
    idle: [
      {
        trigger: "runTopdeckBackfill",
        label: "Full backfill",
        description: "Crawls the source's full history, resuming where the last run stopped.",
      },
    ],
    resumable: [
      {
        trigger: "runTopdeckBackfill",
        label: "Continue backfill",
        description: "Picks up where the last one stopped.",
      },
      {
        trigger: "restartTopdeckBackfill",
        label: "Backfill from scratch",
        description: "The same crawl from day one, ignoring the resume point.",
      },
    ],
  },
};

export const JOB_KIND_PREFIX: Record<MetaSource, string> = {
  uvsgames: "meta.uvsgames_",
  playloltcg: "meta.playloltcg_",
  topdeck: "meta.topdeck_",
};

export const BACKFILL_KIND: Record<MetaSource, string> = {
  uvsgames: "meta.uvsgames_backfill",
  playloltcg: "meta.playloltcg_backfill",
  topdeck: "meta.topdeck_backfill",
};

export const ARCHIVE_TRIGGERS: TriggerEntry[] = [
  {
    trigger: "runRetier",
    label: "Reapply tier rules",
    description:
      "Files every event under the current template mappings and moves the ones whose tier changed. Run this after editing tier mappings in Templates & formats.",
  },
  {
    trigger: "runRepromote",
    label: "Re-promote everything",
    description:
      "Rebuilds every archived event from its sources and accepted overlays. The general repair, for a rule the tier pass cannot see. It takes several minutes.",
    confirm: {
      title: "Re-promote the whole archive?",
      body: () =>
        "Every event is rebuilt from its mirrors and its accepted overlays. Nothing a reviewer accepted is lost, but the pass reads and writes the whole archive and takes several minutes.",
      action: "Run the repair",
    },
  },
];

export const ARCHIVE_KIND_BY_TRIGGER: Partial<Record<MetaSyncTrigger, string>> = {
  runRetier: "meta.retier",
  runRepromote: "meta.repromote",
};
