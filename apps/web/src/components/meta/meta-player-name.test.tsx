import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => {
  function Anchor({
    to,
    params,
    children,
    className,
  }: {
    to?: string;
    params?: Record<string, string>;
    children?: React.ReactNode;
    className?: string;
  }) {
    const href = Object.entries(params ?? {}).reduce(
      (path, [key, value]) => path.replace(`$${key}`, value),
      to ?? "#",
    );
    return (
      <a href={href} className={className}>
        {children ?? "link"}
      </a>
    );
  }
  return { Link: Anchor, createLink: () => Anchor };
});

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaPlayerName } from "./meta-player-name";

describe("MetaPlayerName", () => {
  it("links a name the archive has a page for", () => {
    render(<MetaPlayerName name="M. Álvarez" playerKey="u347713" />);

    expect(screen.getByRole("link", { name: "M. Álvarez" })).toHaveAttribute(
      "href",
      "/meta/players/u347713",
    );
  });

  it("prints a name filed under no identity as plain text", () => {
    render(<MetaPlayerName name="M. Álvarez" playerKey={null} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("M. Álvarez")).toBeInTheDocument();
  });

  it("treats an empty key as no page", () => {
    render(<MetaPlayerName name="M. Álvarez" playerKey="" />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("keeps the caller's classes on both the link and the plain name", () => {
    const { rerender } = render(
      <MetaPlayerName name="M. Álvarez" playerKey="u347713" className="truncate" />,
    );
    expect(screen.getByRole("link", { name: "M. Álvarez" })).toHaveClass("truncate");

    rerender(<MetaPlayerName name="M. Álvarez" playerKey={null} className="truncate" />);
    expect(screen.getByText("M. Álvarez")).toHaveClass("truncate");
  });

  it("positions the link inside a stretched-link tile so it takes its own clicks", () => {
    render(<MetaPlayerName name="M. Álvarez" playerKey="u347713" inStretchedTile />);

    expect(screen.getByRole("link", { name: "M. Álvarez" })).toHaveClass("relative");
  });
});
