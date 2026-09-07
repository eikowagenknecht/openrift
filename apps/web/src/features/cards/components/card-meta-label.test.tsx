import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CardMetaLabel } from "@/features/cards/components/card-meta-label";

function renderLabel(props: Partial<Parameters<typeof CardMetaLabel>[0]> = {}) {
  return render(<CardMetaLabel shortCode="OGN-007" name="Ice Golem" rarity="common" {...props} />);
}

describe("CardMetaLabel", () => {
  it("does not render a size chip for a standard printing", () => {
    const { queryByText } = renderLabel({ oversized: false, sizeLabel: "Oversized" });
    expect(queryByText("Oversized")).toBeNull();
  });

  it("renders the size chip when the printing is oversized", () => {
    const { getByText } = renderLabel({ oversized: true, sizeLabel: "Oversized" });
    expect(getByText("Oversized")).toBeInTheDocument();
  });

  it("omits the size chip when oversized is not set", () => {
    const { queryByText } = renderLabel({ sizeLabel: "Oversized" });
    expect(queryByText("Oversized")).toBeNull();
  });

  it("shows the foil icon at low rarities, where foil is a premium variant", () => {
    const { queryByTitle } = renderLabel({
      rarity: "uncommon",
      finish: "foil",
      finishTitle: "Foil",
    });
    expect(queryByTitle("Foil")).not.toBeNull();
  });

  it("hides the foil icon at always-foil rarities, where foil is the plain version", () => {
    const { queryByTitle } = renderLabel({ rarity: "rare", finish: "foil", finishTitle: "Foil" });
    expect(queryByTitle("Foil")).toBeNull();
  });

  it("keeps metal finish icons at any rarity", () => {
    const { queryByTitle } = renderLabel({ rarity: "epic", finish: "metal", finishTitle: "Metal" });
    expect(queryByTitle("Metal")).not.toBeNull();
  });
});
