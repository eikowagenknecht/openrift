import { render } from "@testing-library/react";
import { QRCodeSVG } from "qrcode.react";
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

/**
 * The module pattern, which changes with the error-correction level.
 * @returns The joined path data of every module path in the code.
 */
function modulesOf(svg: Element): string {
  return [...svg.querySelectorAll("path")].map((path) => path.getAttribute("d")).join("|");
}

describe("QrCode", () => {
  it("encodes at error-correction level M rather than the library default", () => {
    const rendered = modulesOf(svgOf(<QrCode value={SHARE_URL} />));
    const levelM = modulesOf(
      svgOf(<QRCodeSVG value={SHARE_URL} size={160} level="M" marginSize={2} />),
    );
    const levelL = modulesOf(
      svgOf(<QRCodeSVG value={SHARE_URL} size={160} level="L" marginSize={2} />),
    );

    expect(rendered).toBe(levelM);
    // Guards the assertion above: if the two levels ever produced the same
    // pattern, matching level M would prove nothing.
    expect(levelM).not.toBe(levelL);
  });

  it("bakes in a quiet zone so a tight layout cannot crowd the code", () => {
    const withMargin = svgOf(<QrCode value={SHARE_URL} />).getAttribute("viewBox");
    const withoutMargin = svgOf(
      <QRCodeSVG value={SHARE_URL} size={160} level="M" marginSize={0} />,
    ).getAttribute("viewBox");

    expect(withMargin).not.toBe(withoutMargin);
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
