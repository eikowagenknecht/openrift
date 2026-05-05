/**
 * Generates `generated/card.schema.json` from `contributionFileSchema`. The
 * output is the canonical schema for community contributions; copy it into
 * `openrift-data/schemas/card.schema.json` whenever it changes.
 *
 * Run with: `bun run --cwd packages/shared gen:card-schema`
 */
/* oxlint-disable import/no-nodejs-modules -- node-only build script */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { z } from "zod";

import { contributionFileSchema } from "../src/contribute-schema.ts";

const outPath = join(import.meta.dirname, "..", "generated", "card.schema.json");

const generated = z.toJSONSchema(contributionFileSchema, {
  target: "draft-2020-12",
});

const schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/openriftapp/openrift-data/blob/main/schemas/card.schema.json",
  title: "OpenRift Card Contribution",
  description: "Schema for a single data/cards/*.json file. One file per card.",
  ...generated,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(schema, null, 2)}\n`);

console.log(`Wrote ${outPath}`);
