import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DeckIdentityLine } from "./deck-identity-line";

const melLegend = { name: "Soul’s Reflection", types: ["legend" as const], tags: ["Mel"] };

describe("DeckIdentityLine", () => {
  it("names the shared champion once", () => {
    const { container } = render(
      <DeckIdentityLine legendCard={melLegend} championCard={{ name: "Mel, Newly Awakened" }} />,
    );
    expect(container.textContent).toBe("Mel Soul’s Reflection / Newly Awakened");
  });

  it("keeps both full names when the pair names different champions", () => {
    const { container } = render(
      <DeckIdentityLine legendCard={melLegend} championCard={{ name: "Viktor, Innovator" }} />,
    );
    expect(container.textContent).toBe("Mel, Soul’s Reflection / Viktor, Innovator");
  });

  it("appends the format tag summary", () => {
    const { container } = render(
      <DeckIdentityLine
        legendCard={melLegend}
        championCard={{ name: "Mel, Newly Awakened" }}
        tagSummary="Summoner Skirmish"
      />,
    );
    expect(container.textContent).toBe(
      "Mel Soul’s Reflection / Newly Awakened · Summoner Skirmish",
    );
  });

  it("renders the tag summary alone when the deck has no identity yet", () => {
    render(<DeckIdentityLine tagSummary="Summoner Skirmish" />);
    expect(screen.getByText("Summoner Skirmish")).toBeInTheDocument();
  });

  it("renders nothing for an empty deck", () => {
    const { container } = render(<DeckIdentityLine />);
    expect(container).toBeEmptyDOMElement();
  });
});
