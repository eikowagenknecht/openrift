import type { PrintingCitation } from "@openrift/shared/types/catalog";
import { render, screen } from "@testing-library/react";
import { siYoutube } from "simple-icons";
import { describe, expect, it } from "vitest";

import { PrintingCitationList } from "./printing-citations";

function citation(overrides: Partial<PrintingCitation> = {}): PrintingCitation {
  return {
    id: "c-1",
    label: "Launch party unboxing (RiftboundDaily)",
    sourceUrl: "https://www.youtube.com/watch?v=abc123",
    ...overrides,
  };
}

describe("PrintingCitationList", () => {
  it("renders nothing for an uncited printing", () => {
    const { container } = render(<PrintingCitationList citations={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("links a citation that has a URL, opening it safely", () => {
    render(<PrintingCitationList citations={[citation()]} />);

    const link = screen.getByRole("link", { name: /launch party unboxing/iu });
    expect(link).toHaveAttribute("href", "https://www.youtube.com/watch?v=abc123");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("renders a citation with no URL as plain text", () => {
    render(
      <PrintingCitationList
        citations={[citation({ sourceUrl: null, label: "Riot CM in the official Discord" })]}
      />,
    );

    expect(screen.getByText("Riot CM in the official Discord")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows the brand mark for a recognised host", () => {
    const { container } = render(<PrintingCitationList citations={[citation()]} />);

    expect(container.querySelector("path")).toHaveAttribute("d", siYoutube.path);
  });

  it("ignores the label when picking the mark", () => {
    const { container } = render(
      <PrintingCitationList
        citations={[citation({ label: "YouTube video", sourceUrl: "https://example.test/vod" })]}
      />,
    );

    expect(container.querySelector("path")).not.toHaveAttribute("d", siYoutube.path);
  });

  it("prints every citation rather than collapsing the tail", () => {
    render(
      <PrintingCitationList
        citations={[
          citation({ id: "c-1", label: "First" }),
          citation({ id: "c-2", label: "Second", sourceUrl: "https://twitch.tv/x" }),
          citation({ id: "c-3", label: "Third", sourceUrl: "https://x.com/y/status/1" }),
        ]}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("drops the bullet list for a lone citation", () => {
    render(<PrintingCitationList citations={[citation()]} />);

    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
