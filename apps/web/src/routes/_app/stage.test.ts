// oxlint-disable-next-line import/no-nodejs-modules -- test reads its sibling source file as text
import { readFileSync } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules -- test reads its sibling source file as text
import path from "node:path";

import { describe, expect, it } from "vitest";

import { Route } from "./stage";

const validateSearch = Route.options.validateSearch as unknown as {
  parse: (search: Record<string, unknown>) => Record<string, unknown>;
};

// Regression: the queue builder's card browser calls `useFilterValues`, which
// throws ("useFilterSearch must be used within a <FilterSearchProvider>")
// unless the route both validates the filter search params and provides them.
// The schema had them from the start, the provider was missing, and /stage
// crashed on every visit that landed on the builder.
describe("/stage filter search", () => {
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
    const source = readFileSync(path.resolve(import.meta.dirname, "./stage.lazy.tsx"), "utf-8");
    expect(source).toMatch(/<FilterSearchProvider value=\{search\}>/u);
  });
});
