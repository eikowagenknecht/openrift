import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-enums", () => ({
  useDeckFormatList: () => ({
    formats: [
      { slug: "standard", label: "Standard" },
      { slug: "draft", label: "Draft" },
    ],
    labels: { standard: "Standard", draft: "Draft" },
  }),
}));

const { MetaScopeBar } = await import("./meta-scope-bar");
const { ERA_ALL, ERA_CUSTOM } = await import("@/lib/meta-scope");

const ERAS = [
  { id: "proving", label: "Proving Grounds", from: "2026-03-06", to: null },
  { id: "origins", label: "Origins", from: "2025-10-31", to: "2026-03-05" },
];

function renderBar(overrides: Partial<Parameters<typeof MetaScopeBar>[0]> = {}) {
  const setScope = vi.fn();
  const clearScope = vi.fn();
  const user = userEvent.setup();
  const view = render(
    <MetaScopeBar
      scope={{}}
      setScope={setScope}
      clearScope={clearScope}
      eras={ERAS}
      countries={["de", "jp"]}
      {...overrides}
    />,
  );
  return { ...view, setScope, clearScope, user };
}

/** Waits for the select's popup to mount before querying it. */
function option(name: string) {
  return screen.findByRole("option", { name });
}

describe("MetaScopeBar", () => {
  it("opens on all time", () => {
    renderBar();
    expect(screen.getByLabelText("Era")).toHaveTextContent("All time");
  });

  it("offers every era plus the custom range", async () => {
    const { user } = renderBar();
    await user.click(screen.getByLabelText("Era"));
    for (const label of ["All time", "Proving Grounds", "Origins", "Custom range"]) {
      expect(await option(label)).toBeInTheDocument();
    }
  });

  it("writes the picked era to the scope", async () => {
    const { setScope, user } = renderBar();
    await user.click(screen.getByLabelText("Era"));
    await user.click(await option("Origins"));
    expect(setScope).toHaveBeenCalledWith({ era: "origins", from: undefined, to: undefined });
  });

  it("clears the era rather than writing the all-time sentinel", async () => {
    const { setScope, user } = renderBar({ scope: { era: "origins" } });
    await user.click(screen.getByLabelText("Era"));
    await user.click(await option("All time"));
    expect(setScope).toHaveBeenCalledWith({ era: undefined, from: undefined, to: undefined });
  });

  it("shows all time for a bookmarked era that no longer exists, not the dead slug", () => {
    renderBar({ scope: { era: "retired-set" } });
    const trigger = screen.getByLabelText("Era");
    expect(trigger).toHaveTextContent("All time");
    expect(trigger).not.toHaveTextContent("retired-set");
  });

  it("shows all countries for a code absent from the offered set", () => {
    renderBar({ scope: { country: "br" } });
    const trigger = screen.getByLabelText("Country");
    expect(trigger).toHaveTextContent("All countries");
    expect(trigger).not.toHaveTextContent("br");
  });

  it("hides the date pickers outside a custom range", () => {
    renderBar();
    expect(screen.queryByPlaceholderText("From")).not.toBeInTheDocument();
  });

  it("shows the date pickers on a custom range", () => {
    renderBar({ scope: { era: ERA_CUSTOM } });
    expect(screen.getByPlaceholderText("From")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("To")).toBeInTheDocument();
  });

  it("drops the custom bounds when leaving the custom range", async () => {
    const { setScope, user } = renderBar({ scope: { era: ERA_CUSTOM, from: "2026-01-01" } });
    await user.click(screen.getByLabelText("Era"));
    await user.click(await option("Proving Grounds"));
    expect(setScope).toHaveBeenCalledWith({ era: "proving", from: undefined, to: undefined });
  });

  it("names countries rather than printing their codes", async () => {
    const { user } = renderBar();
    await user.click(screen.getByLabelText("Country"));
    expect(await option("Germany")).toBeInTheDocument();
    expect(await option("Japan")).toBeInTheDocument();
  });

  it("hides the country select when there is nothing to choose between", () => {
    renderBar({ countries: ["de"] });
    expect(screen.queryByLabelText("Country")).not.toBeInTheDocument();
  });

  it("offers every tier", async () => {
    const { user } = renderBar();
    await user.click(screen.getByLabelText("Tier"));
    for (const label of ["All tiers", "Premier", "Competitive", "Store", "Casual"]) {
      expect(await option(label)).toBeInTheDocument();
    }
  });

  it("hides the reset while nothing is narrowed", () => {
    renderBar();
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
  });

  it("shows the reset once a facet is set", () => {
    renderBar({ scope: { tier: "premier" } });
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
  });

  it("clears the whole scope from the reset", async () => {
    const { clearScope, user } = renderBar({ scope: { era: ERA_ALL, country: "de" } });
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(clearScope).toHaveBeenCalled();
  });
});
