// oxlint-disable-next-line import/no-nodejs-modules -- test reads its sibling source file as text
import { readFileSync } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules -- test reads its sibling source file as text
import path from "node:path";

import { describe, expect, it } from "vitest";

import { Route } from "./tier-lists_.$tierListId";

const validateSearch = Route.options.validateSearch as unknown as {
  parse: (search: Record<string, unknown>) => Record<string, unknown>;
};

describe("/tier-lists/$tierListId filter search", () => {
  it("validates the shared filter search params", () => {
    expect(validateSearch.parse({ search: "ekko", sets: ["ogn"], sort: "name" })).toMatchObject({
      search: "ekko",
      sets: ["ogn"],
      sort: "name",
    });
  });

  it("drops unknown search params", () => {
    expect(validateSearch.parse({ nonsense: "x" })).not.toHaveProperty("nonsense");
  });

  it("wraps the builder in a FilterSearchProvider", () => {
    const source = readFileSync(
      path.resolve(import.meta.dirname, "./tier-lists_.$tierListId.lazy.tsx"),
      "utf-8",
    );
    expect(source).toMatch(/<FilterSearchProvider value=\{search\}>/u);
  });
});
