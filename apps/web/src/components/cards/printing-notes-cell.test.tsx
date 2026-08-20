import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PrintingNotesCell } from "./printing-notes-cell";

describe("PrintingNotesCell", () => {
  it("renders nothing when the printing has no note, markers or citations", () => {
    const { container } = render(<PrintingNotesCell comment={null} markers={[]} citations={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("chips the markers that say why the printing exists, dropping the generic Promo one", () => {
    const { getByText, queryByText } = render(
      <PrintingNotesCell
        comment={null}
        markers={[
          { id: "m-1", slug: "promo", label: "Promo", description: null },
          { id: "m-2", slug: "top-8", label: "Top 8", description: "Awarded to the top 8." },
        ]}
        citations={[]}
      />,
    );
    expect(getByText("Top 8")).not.toBeNull();
    // Nearly every promo printing carries it, so here it would say nothing.
    expect(queryByText("Promo")).toBeNull();
  });

  it("renders nothing when the only marker is the generic Promo one", () => {
    const { container } = render(
      <PrintingNotesCell
        comment={null}
        markers={[{ id: "m-1", slug: "promo", label: "Promo", description: null }]}
        citations={[]}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("spells the note out in the cell, behind a container query", () => {
    // The text is always in the DOM — a wide enough column reveals it, and the
    // tooltip carries it either way. jsdom resolves no container query, so the
    // class is the assertable part of "wide columns only".
    const { getByText } = render(
      <PrintingNotesCell comment="Handed out at the launch event" markers={[]} citations={[]} />,
    );
    const note = getByText("Handed out at the launch event");
    expect(note.className).toContain("@[10rem]:inline");
    expect(note.className).toContain("hidden");
  });

  it("links a citation that has a URL and opens it in a new tab", () => {
    const { getByLabelText } = render(
      <PrintingNotesCell
        comment={null}
        markers={[]}
        citations={[
          { id: "c-1", label: "Reveal stream", sourceUrl: "https://twitch.tv/riftbound" },
        ]}
      />,
    );
    const link = getByLabelText("Reveal stream");
    expect(link.tagName).toBe("A");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noreferrer");
  });

  it("still shows a citation with no permalink, unlinked", () => {
    // An admin transcribing from a stream nobody archived is owed the same
    // credit as a linkable source, so the glyph renders either way.
    const { getByLabelText } = render(
      <PrintingNotesCell
        comment={null}
        markers={[]}
        citations={[{ id: "c-1", label: "Convention handout", sourceUrl: null }]}
      />,
    );
    expect(getByLabelText("Convention handout").tagName).not.toBe("A");
  });
});
