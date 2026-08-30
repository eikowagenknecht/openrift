import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CountryFlag } from "./country-flag";

describe("CountryFlag", () => {
  it("renders the vendored flag with the country name as its alt", () => {
    render(<CountryFlag code="de" />);
    const flag = screen.getByRole("img", { name: "Germany" });
    expect(flag).toHaveAttribute("src", "/images/flags/de.webp");
  });

  it("prints the code beside the flag", () => {
    render(<CountryFlag code="jp" />);
    expect(screen.getByText("JP")).toBeInTheDocument();
  });

  it("drops the code text without dropping the flag", () => {
    render(<CountryFlag code="jp" showCode={false} />);
    expect(screen.getByRole("img", { name: "Japan" })).toBeInTheDocument();
    expect(screen.queryByText("JP")).not.toBeInTheDocument();
  });

  it("falls back to the code alone when no flag was vendored", () => {
    render(<CountryFlag code="uk" />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("UK")).toBeInTheDocument();
  });

  it("keeps the code visible on the fallback even when the code is suppressed", () => {
    render(<CountryFlag code="uk" showCode={false} />);
    expect(screen.getByText("UK")).toBeInTheDocument();
  });

  it("renders nothing without a usable code", () => {
    const { container } = render(<CountryFlag code={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a code that is not alpha-2", () => {
    const { container } = render(<CountryFlag code="gb-eng" />);
    expect(container).toBeEmptyDOMElement();
  });
});
