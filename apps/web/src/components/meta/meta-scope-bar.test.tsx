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

/** Waits for the popup to mount before querying it. */
function option(name: string) {
  return screen.findByRole("option", { name });
}

/** Opens the menu that hosts the format and country facets. */
async function openFilters(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "More filters" }));
  await screen.findByRole("menu");
}

/** One value facet's dropdown trigger, which reads as the facet until something is picked. */
function facet(text: string) {
  // Inline in the bar the trigger is a combobox; inside the filters menu it is
  // a menu row, which the combobox renders as a plain button.
  const trigger = [...screen.getAllByRole("combobox"), ...screen.getAllByRole("button")].find(
    (element) => element.textContent?.trim().startsWith(text),
  );
  if (trigger === undefined) {
    throw new Error(`no facet trigger reading "${text}"`);
  }
  return trigger;
}

describe("MetaScopeBar", () => {
  it("opens on the current set rather than all time", () => {
    renderBar();
    expect(screen.getByLabelText("Era")).toHaveTextContent("Proving Grounds");
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

  it("writes the all-time sentinel, since an absent era means the current set", async () => {
    const { setScope, user } = renderBar({ scope: { era: "origins" } });
    await user.click(screen.getByLabelText("Era"));
    await user.click(await option("All time"));
    expect(setScope).toHaveBeenCalledWith({ era: ERA_ALL, from: undefined, to: undefined });
  });

  it("shows all time after picking it off the default era", async () => {
    const { user } = renderBar({ scope: { era: ERA_ALL } });
    expect(screen.getByLabelText("Era")).toHaveTextContent("All time");
    await user.click(screen.getByLabelText("Era"));
    expect(await option("All time")).toBeInTheDocument();
  });

  it("shows all time for a bookmarked era that no longer exists, not the dead slug", () => {
    renderBar({ scope: { era: "retired-set" } });
    const trigger = screen.getByLabelText("Era");
    expect(trigger).toHaveTextContent("All time");
    expect(trigger).not.toHaveTextContent("retired-set");
  });

  it("keeps a picked country the offered set no longer holds, so it can be cleared", async () => {
    const { setScope, user } = renderBar({ scope: { countries: ["br"] } });
    await openFilters(user);
    await user.click(facet("br"));
    await user.click(await option("br"));
    expect(setScope).toHaveBeenCalledWith({ countries: [], countriesEx: ["br"] });
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
    await openFilters(user);
    await user.click(facet("Country"));
    expect(await option("Germany")).toBeInTheDocument();
    expect(await option("Japan")).toBeInTheDocument();
  });

  it("hides the country control when there is nothing to choose between", async () => {
    const { user } = renderBar({ countries: ["de"] });
    await openFilters(user);
    expect(screen.queryByText("Country")).not.toBeInTheDocument();
  });

  it("offers every tier", async () => {
    const { user } = renderBar();
    await user.click(facet("Tier"));
    for (const label of ["Premier", "Competitive", "Store", "Casual"]) {
      expect(await option(label)).toBeInTheDocument();
    }
  });

  it("picks a facet value into the include set", async () => {
    const { setScope, user } = renderBar();
    await user.click(facet("Tier"));
    await user.click(await option("Premier"));
    expect(setScope).toHaveBeenCalledWith({ tiers: ["premier"], tiersEx: [] });
  });

  it("adds a second pick rather than replacing the first", async () => {
    const { setScope, user } = renderBar({ scope: { tiers: ["premier"] } });
    await user.click(facet("Premier"));
    await user.click(await option("Store"));
    expect(setScope).toHaveBeenCalledWith({ tiers: ["premier", "store"], tiersEx: [] });
  });

  it("turns a sole pick into an exclusion on the second click", async () => {
    const { setScope, user } = renderBar({ scope: { tiers: ["premier"] } });
    await user.click(facet("Premier"));
    await user.click(await option("Premier"));
    expect(setScope).toHaveBeenCalledWith({ tiers: [], tiersEx: ["premier"] });
  });

  it("clears an exclusion on the third click", async () => {
    const { setScope, user } = renderBar({ scope: { tiersEx: ["premier"] } });
    await user.click(facet("−Premier"));
    await user.click(await option("Premier"));
    expect(setScope).toHaveBeenCalledWith({ tiers: [], tiersEx: [] });
  });

  it("counts the picks behind the filters button, the default format included", () => {
    renderBar();
    expect(screen.getByRole("button", { name: "More filters" })).toHaveTextContent("(1)");
  });

  it("keeps format and country off the bar itself", () => {
    renderBar();
    expect(screen.queryByText("Format")).not.toBeInTheDocument();
    expect(screen.queryByText("Country")).not.toBeInTheDocument();
  });

  it("hides the reset while nothing is narrowed", () => {
    renderBar();
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
  });

  it("shows the reset once a facet is set, including an exclusion", () => {
    const { unmount } = renderBar({ scope: { tiers: ["premier"] } });
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
    unmount();

    renderBar({ scope: { countriesEx: ["de"] } });
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
  });

  it("shows the reset for a surface's own control", () => {
    renderBar({ extras: <span>Holdings</span>, extrasActive: true });
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
  });

  it("clears the whole scope from the reset", async () => {
    const { clearScope, user } = renderBar({ scope: { era: ERA_ALL, countries: ["de"] } });
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(clearScope).toHaveBeenCalled();
  });
});
