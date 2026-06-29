import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CardMetaLabel } from "@/components/cards/card-meta-label";

function renderLabel(props: Partial<Parameters<typeof CardMetaLabel>[0]> = {}) {
  return render(
    <CardMetaLabel
      shortCode="OGN-007"
      name="Ice Golem"
      type="unit"
      superTypes={[]}
      rarity="common"
      {...props}
    />,
  );
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
});
