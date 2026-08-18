import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ShareButton } from "./support-page";

const ICON = <svg aria-hidden="true" />;

describe("ShareButton", () => {
  // It used to render the Button inside an <a>, which an anchor may not
  // contain: the DOM had a link and a button for one action, and both took a
  // tab stop.
  it("renders a linking share as the anchor, not a button inside one", () => {
    const { container } = render(
      <ShareButton label="Star on GitHub" icon={ICON} href="https://example.test/repo" />,
    );

    expect(container.querySelector("a button")).toBeNull();
    expect(container.querySelectorAll("a")).toHaveLength(1);
  });

  it("points that anchor at the target, opened safely", () => {
    render(<ShareButton label="Star on GitHub" icon={ICON} href="https://example.test/repo" />);

    const link = screen.getByRole("link", { name: "Star on GitHub" });
    expect(link).toHaveAttribute("href", "https://example.test/repo");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
  });

  it("stays a button when there is no link to follow", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <ShareButton label="Send a Carrier Pigeon" icon={ICON} onClick={onClick} />,
    );

    expect(container.querySelector("a")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Send a Carrier Pigeon" }));

    expect(onClick).toHaveBeenCalledOnce();
  });
});
