import { createLogger } from "@openrift/shared/logger";
import { describe, expect, it } from "vitest";

import type { Repos, Transact } from "../../../../deps.js";
import type { UvsgamesTemplateInput } from "../../repositories/uvsgames-events.js";
import type { MetaSyncDeps } from "./deps.js";
import { syncEventTemplates } from "./templates.js";
import type { UvsClient } from "./uvsgames-client.js";

const PUBLISHED = [
  { id: "0cbcab3e-be80-4d1d-a450-9485e584906d", name: "Riftbound Regional Qualifier" },
  { id: "f0c650f5-ab18-4d69-8112-19e5cff8b7b2", name: "Summoners' League" },
];

function fakeDeps(options: { get?: () => Promise<unknown>; discovered?: number } = {}): {
  deps: MetaSyncDeps;
  upserted: UvsgamesTemplateInput[];
  paths: string[];
} {
  const upserted: UvsgamesTemplateInput[] = [];
  const paths: string[] = [];

  const client = {
    get: (path: string) => {
      paths.push(path);
      return options.get === undefined ? Promise.resolve(PUBLISHED) : options.get();
    },
    page: () => Promise.reject(new Error("the vocabulary is unpaged")),
    get requests() {
      return paths.length;
    },
  } as unknown as UvsClient;

  const uvsgamesEvents = {
    upsertTemplates: (rows: readonly UvsgamesTemplateInput[]) => {
      upserted.push(...rows);
      return Promise.resolve(rows.length);
    },
    discoverTemplatesFromEvents: () => Promise.resolve(options.discovered ?? 0),
  };

  const deps: MetaSyncDeps = {
    repos: { uvsgamesEvents } as unknown as Repos,
    transact: (() => Promise.reject(new Error("no writes here"))) as unknown as Transact,
    client,
    log: createLogger("test"),
  };
  return { deps, upserted, paths };
}

describe("syncEventTemplates", () => {
  it("stores every template the source publishes, with its own name", async () => {
    const { deps, upserted, paths } = fakeDeps();

    const result = await syncEventTemplates(deps);

    expect(paths).toEqual(["/api/v2/event-configuration-templates/"]);
    expect(upserted).toEqual([
      {
        templateId: "0cbcab3e-be80-4d1d-a450-9485e584906d",
        sourceName: "Riftbound Regional Qualifier",
      },
      { templateId: "f0c650f5-ab18-4d69-8112-19e5cff8b7b2", sourceName: "Summoners' League" },
    ]);
    expect(result).toEqual({ named: 2, retired: 0, errors: [] });
  });

  it("reports the ids only the mirror carries", async () => {
    const { deps } = fakeDeps({ discovered: 3 });

    expect(await syncEventTemplates(deps)).toMatchObject({ named: 2, retired: 3 });
  });

  it("still gives the retired ids their rows when the endpoint is down", async () => {
    const { deps, upserted } = fakeDeps({
      get: () => Promise.reject(new Error("HTTP 500")),
      discovered: 1,
    });

    const result = await syncEventTemplates(deps);

    expect(upserted).toEqual([]);
    expect(result.named).toBe(0);
    expect(result.retired).toBe(1);
    expect(result.errors).toEqual(["Template vocabulary: HTTP 500"]);
  });

  it("writes nothing when the endpoint answers in a shape it never used before", async () => {
    const { deps, upserted } = fakeDeps({ get: () => Promise.resolve({ results: PUBLISHED }) });

    const result = await syncEventTemplates(deps);

    expect(upserted).toEqual([]);
    expect(result).toEqual({ named: 0, retired: 0, errors: [] });
  });
});
