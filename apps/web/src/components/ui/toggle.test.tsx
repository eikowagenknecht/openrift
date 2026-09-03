import { describe, expect, it } from "vitest";

import { toggleVariants } from "@/components/ui/toggle";

describe("toggleVariants", () => {
  it("scopes the outline variant's dark fills to the unpressed state", () => {
    const darkFills = toggleVariants({ variant: "outline" })
      .split(/\s+/u)
      .filter((cls) => cls.startsWith("dark:") && cls.includes(":bg-"));
    expect(darkFills.length).toBeGreaterThan(0);
    for (const cls of darkFills) {
      expect(cls).toMatch(/^dark:not-aria-pressed:/u);
    }
  });
});
