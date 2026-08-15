import { QR_MARGIN, qrMatrix } from "@openrift/shared/qr";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";

import { QrCode } from "./qr-code";

const SHARE_URL = "https://openrift.app/lists/share/AbCdEf123456";

function svgOf(node: ReactElement): Element {
  const { container } = render(node);
  const svg = container.querySelector("svg");
  if (!svg) {
    throw new Error("no svg rendered");
  }
  return svg;
}

describe("QrCode", () => {
  it("draws every dark module of the shared encoder's matrix", () => {
    const matrix = qrMatrix(SHARE_URL);
    const dark = matrix.flat().filter(Boolean).length;
    const drawn =
      svgOf(<QrCode value={SHARE_URL} />)
        .querySelector("path")
        ?.getAttribute("d") ?? "";
    // Runs are merged, so count the modules each `h<n>` run covers.
    const covered = [...drawn.matchAll(/h(?<run>\d+)v1/gu)].reduce(
      (total, match) => total + Number(match.groups?.run),
      0,
    );

    expect(covered).toBe(dark);
  });

  it("bakes in a quiet zone so a tight layout cannot crowd the code", () => {
    const extent = qrMatrix(SHARE_URL).length + QR_MARGIN * 2;

    expect(svgOf(<QrCode value={SHARE_URL} />).getAttribute("viewBox")).toBe(
      `0 0 ${extent} ${extent}`,
    );
  });

  it("keeps the code on a light plate so it scans in either theme", () => {
    const { container } = render(<QrCode value={SHARE_URL} />);
    const plate = container.firstElementChild;

    expect(plate?.className).toContain("bg-white");
  });

  it("renders at the requested size and defaults to 160", () => {
    expect(svgOf(<QrCode value={SHARE_URL} size={224} />).getAttribute("width")).toBe("224");
    expect(svgOf(<QrCode value={SHARE_URL} />).getAttribute("width")).toBe("160");
  });

  it("names the code for screen readers", () => {
    const svg = svgOf(<QrCode value={SHARE_URL} label="QR code for the join link" />);

    expect(svg.getAttribute("role")).toBe("img");
    expect(svg.getAttribute("aria-label")).toBe("QR code for the join link");
    expect(svgOf(<QrCode value={SHARE_URL} />).getAttribute("aria-label")).toBe("QR code");
  });

  it("merges a caller class onto the plate without dropping the plate's own", () => {
    const { container } = render(<QrCode value={SHARE_URL} className="mx-auto" />);
    const plate = container.firstElementChild;

    expect(plate?.className).toContain("mx-auto");
    expect(plate?.className).toContain("bg-white");
  });
});
