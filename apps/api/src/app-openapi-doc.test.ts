import { createLogger } from "@openrift/shared/logger";
import { describe, expect, it } from "vitest";

import { createApp } from "./app.js";

// ---------------------------------------------------------------------------
// Doc split: the public spec (/api/doc) must exclude the admin surface,
// and the admin spec (/api/admin/doc) must contain only it. Doc generation only
// reads static route metadata, so minimal mock deps are enough to boot the app.
// ---------------------------------------------------------------------------

const mockAuth = {
  handler: () => new Response("ok"),
  api: { getSession: () => null },
  $Infer: { Session: { user: null, session: null } },
};

const app = createApp({
  // oxlint-disable-next-line typescript/no-explicit-any -- minimal stubs to boot the app
  db: {} as any,
  // oxlint-disable-next-line typescript/no-explicit-any -- minimal stubs to boot the app
  auth: mockAuth as any,
  config: {
    port: 3000,
    databaseUrl: "postgres://mock",
    corsOrigin: undefined,
    auth: { secret: "test-secret", adminEmail: undefined, google: undefined, discord: undefined },
    smtp: { configured: false },
    cron: { enabled: false, tcgplayerSchedule: "", cardmarketSchedule: "" },
    isDev: false,
    // oxlint-disable-next-line typescript/no-explicit-any -- minimal stubs to boot the app
  } as any,
  log: createLogger("test", "silent"),
});

async function fetchDoc(
  path: string,
): Promise<{ paths: Record<string, unknown>; info: { title: string } }> {
  const res = await app.fetch(new Request(`http://localhost${path}`));
  expect(res.status).toBe(200);
  return res.json() as Promise<{ paths: Record<string, unknown>; info: { title: string } }>;
}

describe("OpenAPI doc split", () => {
  it("public /api/doc excludes the admin surface", async () => {
    const doc = await fetchDoc("/api/doc");
    const paths = Object.keys(doc.paths);
    expect(doc.info.title).toBe("OpenRift API");
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.some((p) => p.startsWith("/api/admin/"))).toBe(false);
    // A representative public path is still present.
    expect(paths.some((p) => p.startsWith("/api/v1/"))).toBe(true);
  });

  it("admin /api/admin/doc contains only the admin surface", async () => {
    const doc = await fetchDoc("/api/admin/doc");
    const paths = Object.keys(doc.paths);
    expect(doc.info.title).toBe("OpenRift Admin API");
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.every((p) => p.startsWith("/api/admin/"))).toBe(true);
    // A representative admin path is present at the new base.
    expect(paths).toContain("/api/admin/v1/me");
  });
});
