import { describe, expect, it } from "vitest";

import { createRecordingDb } from "../test/recording-db.js";
import { printingCitationsRepo } from "./printing-citations.js";

describe("printingCitationsRepo", () => {
  describe("listForPrintingIds", () => {
    it("short-circuits an empty batch instead of building an empty IN list", async () => {
      const { db, queries } = createRecordingDb();

      await expect(printingCitationsRepo(db).listForPrintingIds([])).resolves.toEqual([]);
      expect(queries).toHaveLength(0);
    });

    it("orders by the display key so a page cannot reshuffle between requests", async () => {
      const { db, queries } = createRecordingDb();

      await printingCitationsRepo(db).listForPrintingIds(["printing-1", "printing-2"]);

      expect(queries).toHaveLength(1);
      expect(queries[0]).toContain('order by "sort_order", "id"');
    });
  });

  describe("listForPrinting", () => {
    it("scopes to the one printing, in display order", async () => {
      const { db, queries, parameters } = createRecordingDb();

      await printingCitationsRepo(db).listForPrinting("printing-1");

      expect(queries[0]).toContain('where "printing_id" = $1');
      expect(queries[0]).toContain('order by "sort_order", "id"');
      expect(parameters[0]).toEqual(["printing-1"]);
    });
  });

  describe("insert", () => {
    it("appends past the printing's current maximum sort order", async () => {
      const { db, queries, parameters } = createRecordingDb([
        [{ sortOrder: 4 }],
        [
          {
            id: "citation-1",
            printingId: "printing-1",
            label: "VOD",
            sourceUrl: null,
            sortOrder: 5,
          },
        ],
      ]);

      const row = await printingCitationsRepo(db).insert({
        printingId: "printing-1",
        label: "VOD",
        sourceUrl: null,
      });

      expect(queries[0]).toContain('order by "sort_order" desc');
      expect(queries[1]).toContain('insert into "printing_citations"');
      // The new row sorts last, so an admin adding one never has to reorder.
      expect(parameters[1]).toContain(5);
      expect(row.id).toBe("citation-1");
    });

    it("starts a printing's first citation at zero", async () => {
      const { db, parameters } = createRecordingDb([
        [],
        [
          {
            id: "citation-1",
            printingId: "printing-1",
            label: "VOD",
            sourceUrl: null,
            sortOrder: 0,
          },
        ],
      ]);

      await printingCitationsRepo(db).insert({
        printingId: "printing-1",
        label: "VOD",
        sourceUrl: null,
      });

      expect(parameters[1]).toContain(0);
    });
  });

  describe("update", () => {
    it("writes only the fields the caller sent", async () => {
      const { db, queries, parameters } = createRecordingDb([[{ id: "citation-1" }]]);

      await printingCitationsRepo(db).update("citation-1", {
        sourceUrl: "https://web.archive.org/x",
      });

      expect(queries[0]).toContain('update "printing_citations"');
      expect(queries[0]).toContain('"source_url"');
      // The label was not sent, so it must not appear in the SET clause at all.
      expect(queries[0]).not.toContain('"label"');
      expect(parameters[0]).toEqual(["https://web.archive.org/x", "citation-1"]);
    });

    // An explicit null clears the link. `?? undefined` anywhere on this path
    // would turn that into "leave it alone".
    it("clears the link when sourceUrl is explicitly null", async () => {
      const { db, queries, parameters } = createRecordingDb([[{ id: "citation-1" }]]);

      await printingCitationsRepo(db).update("citation-1", { sourceUrl: null });

      expect(queries[0]).toContain('"source_url"');
      expect(parameters[0]).toEqual([null, "citation-1"]);
    });

    // Never writable: a citation moves only by being added, so an edit cannot
    // reorder the list behind the reader's back.
    it("never writes sortOrder", async () => {
      const { db, queries } = createRecordingDb([[{ id: "citation-1" }]]);

      await printingCitationsRepo(db).update("citation-1", { label: "Corrected" });

      expect(queries[0]).not.toContain("sort_order");
    });

    // Kysely compiles an empty SET to invalid SQL, and the caller still needs
    // to learn whether the row exists.
    it("falls back to an existence check when nothing was sent", async () => {
      const { db, queries } = createRecordingDb([[{ id: "citation-1" }]]);

      await expect(printingCitationsRepo(db).update("citation-1", {})).resolves.toBe("citation-1");

      expect(queries).toHaveLength(1);
      expect(queries[0]).toContain('select "id" from "printing_citations"');
    });

    it("returns undefined when nothing matched, so the route can answer 404", async () => {
      const { db } = createRecordingDb([[]]);

      await expect(
        printingCitationsRepo(db).update("missing", { label: "Corrected" }),
      ).resolves.toBeUndefined();
    });
  });

  describe("delete", () => {
    it("returns the deleted id", async () => {
      const { db } = createRecordingDb([[{ id: "citation-1" }]]);

      await expect(printingCitationsRepo(db).delete("citation-1")).resolves.toBe("citation-1");
    });

    it("returns undefined when nothing matched, so the route can answer 404", async () => {
      const { db } = createRecordingDb([[]]);

      await expect(printingCitationsRepo(db).delete("missing")).resolves.toBeUndefined();
    });
  });
});
