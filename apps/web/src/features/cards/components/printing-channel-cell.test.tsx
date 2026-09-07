import type { PrintingDistributionChannel } from "@openrift/shared/types/catalog";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PrintingChannelCell } from "./printing-channel-cell";

function stubChannel(label: string, ancestorLabels: string[] = []): PrintingDistributionChannel {
  return {
    channel: {
      id: `ch-${label}`,
      slug: label.toLowerCase().replaceAll(" ", "-"),
      label,
      description: null,
      kind: "event",
      parentId: null,
      childrenLabel: null,
    },
    distributionNote: null,
    ancestorLabels,
  };
}

describe("PrintingChannelCell", () => {
  it("renders nothing when the printing has no channel", () => {
    const { container } = render(<PrintingChannelCell channels={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("puts the ancestors above the channel's own label", () => {
    const { getByText } = render(
      <PrintingChannelCell channels={[stubChannel("Top 8", ["Events", "Championships"])]} />,
    );
    expect(getByText("Events › Championships")).not.toBeNull();
    expect(getByText("Top 8")).not.toBeNull();
  });

  it("names only the first channel, counting the rest in the title", () => {
    const { getByText, container } = render(
      <PrintingChannelCell channels={[stubChannel("Worlds 2026"), stubChannel("Store Kit")]} />,
    );
    expect(getByText("+1")).not.toBeNull();
    expect(container.querySelector('[title*="Store Kit"]')).not.toBeNull();
  });
});
