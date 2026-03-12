import postgres from "postgres";

// oxlint-disable-next-line no-non-null-assertion -- script requires DATABASE_URL to be set
const sql = postgres(process.env.DATABASE_URL!);

const [row] = await sql`
  SELECT name, type, super_types, domains, might, energy, power, might_bonus,
         keywords, rules_text, effect_text, tags, source_id, source_entity_id, extra_data
  FROM card_sources WHERE source = ${"riftbinder"} AND name = ${"Jinx Rebel"}
`;

const FIELDS = [
  "name",
  "type",
  "super_types",
  "domains",
  "might",
  "energy",
  "power",
  "might_bonus",
  "keywords",
  "rules_text",
  "effect_text",
  "tags",
  "source_id",
  "source_entity_id",
  "extra_data",
];

for (const f of FIELDS) {
  const a = row[f];
  const b = row[f]; // same value — should always match

  const isObjA = typeof a === "object" && a !== null;
  const isObjB = typeof b === "object" && b !== null;
  const eq = isObjA && isObjB ? JSON.stringify(a) === JSON.stringify(b) : a === b;

  console.log(
    eq ? "OK:  " : "DIFF:",
    f.padEnd(20),
    `typeof=${typeof a}`.padEnd(16),
    `isArray=${Array.isArray(a)}`.padEnd(14),
    JSON.stringify(a)?.slice(0, 60) ?? "undefined",
  );
}

await sql.end();
