import type { MetaCreditVisibility } from "@openrift/shared/types/enums";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MetaCreditSection } from "./meta-credit-section";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <a href="/profile" className={className}>
      {children}
    </a>
  ),
}));

let metaEnabled = true;
let visibility: MetaCreditVisibility = "hidden";
let isPending = false;
let user: { name?: string | null; riotId?: string | null } | null = null;
const setVisibility = vi.fn();

vi.mock("@/hooks/use-feature-flags", () => ({
  useFeatureEnabled: () => metaEnabled,
}));

vi.mock("@/lib/auth-session", () => ({
  useSession: () => ({ data: user ? { user } : null }),
}));

vi.mock("@/hooks/use-meta-submissions", () => ({
  useMetaCreditVisibility: () => ({ data: isPending ? undefined : { visibility }, isPending }),
  useSetMetaCreditVisibility: () => ({ mutate: setVisibility, isPending: false }),
}));

beforeEach(() => {
  setVisibility.mockReset();
  metaEnabled = true;
  visibility = "hidden";
  isPending = false;
  user = { name: "Riven Fan", riotId: "rivenfan#EUW" };
});

describe("MetaCreditSection", () => {
  it("renders nothing while the archive is unlaunched", () => {
    metaEnabled = false;
    const { container } = render(<MetaCreditSection />);
    expect(container).toBeEmptyDOMElement();
  });

  it("starts on 'don't credit me' and says nothing would be printed", () => {
    render(<MetaCreditSection />);
    expect(screen.getByRole("radio", { name: /Don't credit me/u })).toBeChecked();
    expect(screen.getByText(/Nothing names you/u)).toBeInTheDocument();
  });

  it.each<[string, MetaCreditVisibility]>([
    ["Credit my display name", "name"],
    ["Credit my Riot ID", "riot_id"],
  ])("picking %s saves %s", async (label, expected) => {
    render(<MetaCreditSection />);
    await userEvent.click(screen.getByRole("radio", { name: new RegExp(label, "u") }));
    expect(setVisibility).toHaveBeenCalledWith({ visibility: expected });
  });

  it("switching back off saves hidden", async () => {
    visibility = "name";
    render(<MetaCreditSection />);
    await userEvent.click(screen.getByRole("radio", { name: /Don't credit me/u }));
    expect(setVisibility).toHaveBeenCalledWith({ visibility: "hidden" });
  });

  it("previews the display name when that is what is credited", () => {
    visibility = "name";
    render(<MetaCreditSection />);
    expect(screen.getByText("Contributed by Riven Fan")).toBeInTheDocument();
  });

  it("previews the Riot ID when one is set", () => {
    visibility = "riot_id";
    render(<MetaCreditSection />);
    expect(screen.getByText("Contributed by rivenfan#EUW")).toBeInTheDocument();
  });

  it("previews the display name, and says so, when the Riot ID is unset", () => {
    visibility = "riot_id";
    user = { name: "Riven Fan", riotId: null };
    render(<MetaCreditSection />);
    expect(screen.getByText("Contributed by Riven Fan")).toBeInTheDocument();
    expect(screen.getByText(/no Riot ID yet/u)).toBeInTheDocument();
  });

  it("warns that nobody would be credited when both fields are empty", () => {
    visibility = "riot_id";
    user = { name: "", riotId: "" };
    render(<MetaCreditSection />);
    expect(screen.getByText(/left off the page entirely/u)).toBeInTheDocument();
  });

  it("shows a placeholder instead of the options while the setting loads", () => {
    isPending = true;
    render(<MetaCreditSection />);
    expect(screen.queryByRole("radio", { name: /Don't credit me/u })).not.toBeInTheDocument();
  });
});
