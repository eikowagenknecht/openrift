import { describe, expect, it } from "vitest";

import { cycleIncludeExclude } from "./filter-cycle";

describe("cycleIncludeExclude", () => {
  it("includes a value on a fresh axis", () => {
    expect(cycleIncludeExclude([], [], "a")).toEqual({ included: ["a"], excluded: [] });
  });

  it("adds to the include set when the axis already includes", () => {
    expect(cycleIncludeExclude(["a"], [], "b")).toEqual({ included: ["a", "b"], excluded: [] });
  });

  it("flips the sole included value into exclude-mode", () => {
    expect(cycleIncludeExclude(["a"], [], "a")).toEqual({ included: [], excluded: ["a"] });
  });

  it("deselects one of several includes instead of excluding it", () => {
    expect(cycleIncludeExclude(["a", "b"], [], "a")).toEqual({ included: ["b"], excluded: [] });
  });

  it("adds to the exclude set when the axis already excludes", () => {
    expect(cycleIncludeExclude([], ["a"], "b")).toEqual({ included: [], excluded: ["a", "b"] });
  });

  it("clears an excluded value", () => {
    expect(cycleIncludeExclude([], ["a"], "a")).toEqual({ included: [], excluded: [] });
  });

  it("cycles a single value off → include → exclude → off across three clicks", () => {
    const first = cycleIncludeExclude([], [], "a");
    expect(first).toEqual({ included: ["a"], excluded: [] });
    const second = cycleIncludeExclude(first.included, first.excluded, "a");
    expect(second).toEqual({ included: [], excluded: ["a"] });
    const third = cycleIncludeExclude(second.included, second.excluded, "a");
    expect(third).toEqual({ included: [], excluded: [] });
  });

  it("does not mutate the input arrays", () => {
    const included = ["a"];
    const excluded = ["b"];
    cycleIncludeExclude(included, excluded, "a");
    expect(included).toEqual(["a"]);
    expect(excluded).toEqual(["b"]);
  });
});
