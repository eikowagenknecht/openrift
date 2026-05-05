/**
 * Asserts that `generated/card.schema.json` is in sync with the Zod schema.
 * Run `bun run gen:card-schema` to regenerate if this fails.
 */
/* oxlint-disable import/no-nodejs-modules -- node-only test reads a file from disk */
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import { contributionFileSchema } from "./contribute-schema.js";

const generatedPath = join(import.meta.dirname, "..", "generated", "card.schema.json");

describe("generated/card.schema.json", () => {
  it("matches the output of generate-card-schema.ts", () => {
    const onDisk = readFileSync(generatedPath, "utf-8");
    const generated = z.toJSONSchema(contributionFileSchema, {
      target: "draft-2020-12",
    });
    const expected = `${JSON.stringify(
      {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        $id: "https://github.com/openriftapp/openrift-data/blob/main/schemas/card.schema.json",
        title: "OpenRift Card Contribution",
        description: "Schema for a single data/cards/*.json file. One file per card.",
        ...generated,
      },
      null,
      2,
    )}\n`;
    expect(onDisk).toBe(expected);
  });
});
