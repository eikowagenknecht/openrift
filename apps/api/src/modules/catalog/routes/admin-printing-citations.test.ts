import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { registerRouterForTest } from "../../../test/mount-router.js";
import { readJson } from "../../../test/read-json.js";
import type { Variables } from "../../../types.js";
import { adminPrintingCitationsRouter } from "./admin-printing-citations";

const mockCatalog = { printingById: vi.fn() };

const mockPrintingCitations = {
  listForPrinting: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

const mockAdminEvents = { insert: vi.fn() };

const USER_ID = "a0000000-0001-4000-a000-000000000001";
const PRINTING_ID = "b0000000-0001-4000-a000-000000000001";
const CITATION_ID = "c0000000-0001-4000-a000-000000000001";

const BASE = `/api/admin/v1/printings/${PRINTING_ID}/citations`;

const app = new Hono<{ Variables: Variables }>();
app.use("*", async (c, next) => {
  c.set("user", { id: USER_ID } as never);
  c.set("repos", {
    adminEvents: mockAdminEvents,
    catalog: mockCatalog,
    printingCitations: mockPrintingCitations,
  } as never);
  await next();
});
registerRouterForTest(app, adminPrintingCitationsRouter);

function citationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CITATION_ID,
    printingId: PRINTING_ID,
    label: "Launch party unboxing (RiftboundDaily)",
    sourceUrl: "https://www.youtube.com/watch?v=abc123",
    sortOrder: 0,
    ...overrides,
  };
}

function createCitation(body: unknown) {
  return app.request(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("GET /printings/{printingId}/citations", () => {
  it("lists the printing's citations without exposing the server-only sortOrder", async () => {
    mockCatalog.printingById.mockResolvedValue({ id: PRINTING_ID });
    mockPrintingCitations.listForPrinting.mockResolvedValue([
      citationRow(),
      citationRow({ id: "c0000000-0001-4000-a000-000000000002", sourceUrl: null }),
    ]);

    const res = await app.request(BASE);

    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.citations).toHaveLength(2);
    expect(json.citations[1].sourceUrl).toBeNull();
    expect(json.citations[0].sortOrder).toBeUndefined();
  });

  it("404s for an unknown printing", async () => {
    mockCatalog.printingById.mockResolvedValue(undefined);

    const res = await app.request(BASE);

    expect(res.status).toBe(404);
    expect(mockPrintingCitations.listForPrinting).not.toHaveBeenCalled();
  });
});

describe("POST /printings/{printingId}/citations", () => {
  it("writes a citation", async () => {
    mockCatalog.printingById.mockResolvedValue({ id: PRINTING_ID });
    mockPrintingCitations.insert.mockResolvedValue(citationRow());

    const res = await createCitation({
      label: "Launch party unboxing (RiftboundDaily)",
      sourceUrl: "https://www.youtube.com/watch?v=abc123",
    });

    expect(res.status).toBe(201);
    expect(mockPrintingCitations.insert).toHaveBeenCalledWith({
      printingId: PRINTING_ID,
      label: "Launch party unboxing (RiftboundDaily)",
      sourceUrl: "https://www.youtube.com/watch?v=abc123",
    });
  });

  it("accepts a citation with no link", async () => {
    mockCatalog.printingById.mockResolvedValue({ id: PRINTING_ID });
    mockPrintingCitations.insert.mockResolvedValue(citationRow({ sourceUrl: null }));

    const res = await createCitation({ label: "Riot CM in the official Discord", sourceUrl: null });

    expect(res.status).toBe(201);
    const json = await readJson(res);
    expect(json.sourceUrl).toBeNull();
  });

  it("rejects a blank label", async () => {
    mockCatalog.printingById.mockResolvedValue({ id: PRINTING_ID });

    const res = await createCitation({ label: "   ", sourceUrl: null });

    expect(res.status).toBe(400);
    expect(mockPrintingCitations.insert).not.toHaveBeenCalled();
  });

  it("rejects a label past the column's limit", async () => {
    mockCatalog.printingById.mockResolvedValue({ id: PRINTING_ID });

    const res = await createCitation({ label: "x".repeat(121), sourceUrl: null });

    expect(res.status).toBe(400);
    expect(mockPrintingCitations.insert).not.toHaveBeenCalled();
  });

  it("rejects a non-http(s) link, since it is rendered as a raw href", async () => {
    mockCatalog.printingById.mockResolvedValue({ id: PRINTING_ID });

    // oxlint-disable-next-line no-script-url -- the payload under test is the point
    const res = await createCitation({ label: "VOD", sourceUrl: "javascript:alert(1)" });

    expect(res.status).toBe(400);
    expect(mockPrintingCitations.insert).not.toHaveBeenCalled();
  });

  it("409s when the same link is already cited on the printing", async () => {
    mockCatalog.printingById.mockResolvedValue({ id: PRINTING_ID });
    mockPrintingCitations.insert.mockRejectedValue(
      Object.assign(new Error("duplicate key"), {
        code: "23505",
        constraint_name: "uq_printing_citations_url",
      }),
    );

    const res = await createCitation({
      label: "VOD",
      sourceUrl: "https://www.youtube.com/watch?v=abc123",
    });

    expect(res.status).toBe(409);
  });

  it("404s for an unknown printing", async () => {
    mockCatalog.printingById.mockResolvedValue(undefined);

    const res = await createCitation({ label: "VOD", sourceUrl: null });

    expect(res.status).toBe(404);
    expect(mockPrintingCitations.insert).not.toHaveBeenCalled();
  });
});

describe("PATCH /printings/{printingId}/citations/{citationId}", () => {
  function patchCitation(body: unknown) {
    return app.request(`${BASE}/${CITATION_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("repoints a link without touching the label", async () => {
    mockPrintingCitations.listForPrinting.mockResolvedValue([citationRow()]);
    mockPrintingCitations.update.mockResolvedValue(CITATION_ID);

    const res = await patchCitation({ sourceUrl: "https://web.archive.org/web/1/youtube" });

    expect(res.status).toBe(204);
    expect(mockPrintingCitations.update).toHaveBeenCalledWith(CITATION_ID, {
      sourceUrl: "https://web.archive.org/web/1/youtube",
    });
  });

  it("edits the label without touching the link", async () => {
    mockPrintingCitations.listForPrinting.mockResolvedValue([citationRow()]);
    mockPrintingCitations.update.mockResolvedValue(CITATION_ID);

    const res = await patchCitation({ label: "Launch party unboxing (corrected)" });

    expect(res.status).toBe(204);
    expect(mockPrintingCitations.update).toHaveBeenCalledWith(CITATION_ID, {
      label: "Launch party unboxing (corrected)",
    });
  });

  it("clears the link when sourceUrl is explicitly null", async () => {
    mockPrintingCitations.listForPrinting.mockResolvedValue([citationRow()]);
    mockPrintingCitations.update.mockResolvedValue(CITATION_ID);

    const res = await patchCitation({ sourceUrl: null });

    expect(res.status).toBe(204);
    expect(mockPrintingCitations.update).toHaveBeenCalledWith(CITATION_ID, { sourceUrl: null });
  });

  it("rejects a non-http(s) link", async () => {
    mockPrintingCitations.listForPrinting.mockResolvedValue([citationRow()]);

    // oxlint-disable-next-line no-script-url -- the payload under test is the point
    const res = await patchCitation({ sourceUrl: "javascript:alert(1)" });

    expect(res.status).toBe(400);
    expect(mockPrintingCitations.update).not.toHaveBeenCalled();
  });

  it("rejects a blank label", async () => {
    mockPrintingCitations.listForPrinting.mockResolvedValue([citationRow()]);

    const res = await patchCitation({ label: "   " });

    expect(res.status).toBe(400);
    expect(mockPrintingCitations.update).not.toHaveBeenCalled();
  });

  it("rejects an attempt to write sortOrder, which would let a caller reorder the list", async () => {
    mockPrintingCitations.listForPrinting.mockResolvedValue([citationRow()]);

    const res = await patchCitation({ sortOrder: 0 });

    expect(res.status).toBe(400);
    expect(mockPrintingCitations.update).not.toHaveBeenCalled();
  });

  it("409s when the new link is already cited on the printing", async () => {
    mockPrintingCitations.listForPrinting.mockResolvedValue([citationRow()]);
    mockPrintingCitations.update.mockRejectedValue(
      Object.assign(new Error("duplicate key"), {
        code: "23505",
        constraint_name: "uq_printing_citations_url",
      }),
    );

    const res = await patchCitation({ sourceUrl: "https://youtu.be/already-cited" });

    expect(res.status).toBe(409);
  });

  it("404s a citation that belongs to a different printing", async () => {
    mockPrintingCitations.listForPrinting.mockResolvedValue([
      citationRow({ id: "c0000000-0001-4000-a000-000000000009" }),
    ]);

    const res = await patchCitation({ label: "Corrected" });

    expect(res.status).toBe(404);
    expect(mockPrintingCitations.update).not.toHaveBeenCalled();
  });

  it("404s when the row vanished between the ownership check and the write", async () => {
    mockPrintingCitations.listForPrinting.mockResolvedValue([citationRow()]);
    mockPrintingCitations.update.mockResolvedValue(undefined);

    const res = await patchCitation({ label: "Corrected" });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /printings/{printingId}/citations/{citationId}", () => {
  it("removes a citation", async () => {
    mockPrintingCitations.listForPrinting.mockResolvedValue([citationRow()]);
    mockPrintingCitations.delete.mockResolvedValue(CITATION_ID);

    const res = await app.request(`${BASE}/${CITATION_ID}`, { method: "DELETE" });

    expect(res.status).toBe(204);
    expect(mockPrintingCitations.delete).toHaveBeenCalledWith(CITATION_ID);
    expect(mockAdminEvents.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        actorUserId: USER_ID,
        action: "citation.delete",
        entityType: "citation",
        entityId: CITATION_ID,
      }),
    );
  });

  it("404s a citation that belongs to a different printing", async () => {
    mockPrintingCitations.listForPrinting.mockResolvedValue([
      citationRow({ id: "c0000000-0001-4000-a000-000000000009" }),
    ]);

    const res = await app.request(`${BASE}/${CITATION_ID}`, { method: "DELETE" });

    expect(res.status).toBe(404);
    expect(mockPrintingCitations.delete).not.toHaveBeenCalled();
  });
});
