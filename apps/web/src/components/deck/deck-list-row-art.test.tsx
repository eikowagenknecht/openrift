import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DeckListRowArt } from "@/components/deck/deck-overview-list";

describe("DeckListRowArt", () => {
  it("renders the art when a source is given", () => {
    const { container } = render(<DeckListRowArt src="/media/cards/art-400w.webp" />);
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("renders the empty box when the row resolved no printing", () => {
    const { container } = render(<DeckListRowArt />);
    expect(container.querySelector("img")).toBeNull();
  });

  // A printing can be catalogued before its art is rehosted, so the URL exists
  // and 404s. Without this the row keeps the browser's broken-image glyph.
  it("drops back to the empty box when the file is missing on the server", () => {
    const { container } = render(<DeckListRowArt src="/media/cards/gone-400w.webp" />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();

    fireEvent.error(img!);
    expect(container.querySelector("img")).toBeNull();
  });

  it("retries a different source after one failed", () => {
    const { container, rerender } = render(<DeckListRowArt src="/media/cards/gone-400w.webp" />);
    fireEvent.error(container.querySelector("img")!);

    rerender(<DeckListRowArt src="/media/cards/other-400w.webp" />);
    expect(container.querySelector("img")).not.toBeNull();
  });
});
