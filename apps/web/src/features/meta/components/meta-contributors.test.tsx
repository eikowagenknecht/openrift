import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MetaContributors } from "./meta-contributors";

function line(names: string[]): string | null {
  render(<MetaContributors contributors={names} />);
  return screen.queryByText(/^Contributed by/u)?.textContent ?? null;
}

describe("MetaContributors", () => {
  it("renders nothing when nobody is credited", () => {
    expect(line([])).toBeNull();
  });

  it("names a single contributor", () => {
    expect(line(["Alice"])).toBe("Contributed by Alice");
  });

  it("joins two names with 'and'", () => {
    expect(line(["Alice", "Bob"])).toBe("Contributed by Alice and Bob");
  });

  it("names three in full", () => {
    expect(line(["Alice", "Bob", "Carol"])).toBe("Contributed by Alice, Bob and Carol");
  });

  it("absorbs an overflow of exactly one rather than printing 'and 1 other'", () => {
    expect(line(["Alice", "Bob", "Carol", "Dan"])).toBe("Contributed by Alice, Bob, Carol and Dan");
  });

  it("collapses to a count past the threshold", () => {
    expect(line(["Alice", "Bob", "Carol", "Dan", "Erin"])).toBe(
      "Contributed by Alice, Bob, Carol and 2 others",
    );
  });

  it("keeps the count accurate for a long list", () => {
    expect(line(["Alice", "Bob", "Carol", "Dan", "Erin", "Frank", "Grace"])).toBe(
      "Contributed by Alice, Bob, Carol and 4 others",
    );
  });

  it("credits nobody with a profile link", () => {
    render(<MetaContributors contributors={["Alice", "Bob"]} />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("takes its spacing from the surface it sits on", () => {
    render(<MetaContributors contributors={["Alice"]} className="mt-1" />);
    expect(screen.getByText(/^Contributed by/u).className).toContain("mt-1");
  });
});
