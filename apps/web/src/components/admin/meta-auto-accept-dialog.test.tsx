import type { MetaSyncSettings } from "@openrift/shared/contracts/admin/meta-catalog";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  settings: null as unknown,
  updateSettings: vi.fn(),
}));

vi.mock("@/hooks/use-admin-meta-catalog", () => ({
  useMetaSyncSettings: () => ({ data: captured.settings }),
  useUpdateMetaSyncSettings: () => ({ mutate: captured.updateSettings, isPending: false }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaAutoAcceptDialog } from "./meta-auto-accept-dialog";

const settings: MetaSyncSettings = {
  autoAcceptMinPlayers: 64,
  autoAcceptNotable: true,
  autoAcceptOfficial: false,
  competitivePlayerFloor: 128,
  updatedAt: "2026-08-20T10:00:00.000Z",
};

describe("MetaAutoAcceptDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.settings = settings;
  });

  it("seeds the rule form from the stored settings", async () => {
    render(<MetaAutoAcceptDialog source="uvsgames" onClose={vi.fn()} />);

    expect(await screen.findByLabelText("Minimum field size")).toHaveValue(64);
    expect(screen.getByRole("switch", { name: /notable vocabulary/u })).toBeChecked();
    expect(screen.getByRole("switch", { name: /template you watch/u })).not.toBeChecked();
  });

  it("waits for the stored rules rather than seeding the form with defaults", () => {
    captured.settings = undefined;
    render(<MetaAutoAcceptDialog source="uvsgames" onClose={vi.fn()} />);

    expect(screen.getByText("Loading the rules…")).toBeInTheDocument();
    expect(screen.queryByLabelText("Minimum field size")).not.toBeInTheDocument();
  });

  it("saves the field-size rule as the number that was typed", async () => {
    const user = userEvent.setup();
    render(<MetaAutoAcceptDialog source="uvsgames" onClose={vi.fn()} />);

    const input = await screen.findByLabelText("Minimum field size");
    await user.clear(input);
    await user.type(input, "128");
    await user.click(screen.getByRole("button", { name: "Save rules" }));

    expect(captured.updateSettings).toHaveBeenCalledWith({
      autoAcceptMinPlayers: 128,
      autoAcceptNotable: true,
      autoAcceptOfficial: false,
    });
  });

  it("saves the official-template rule the switch turned on", async () => {
    const user = userEvent.setup();
    render(<MetaAutoAcceptDialog source="uvsgames" onClose={vi.fn()} />);

    await user.click(await screen.findByRole("switch", { name: /template you watch/u }));
    await user.click(screen.getByRole("button", { name: "Save rules" }));

    expect(captured.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ autoAcceptOfficial: true }),
    );
  });

  it("turns the field-size rule off with a null rather than a threshold nothing meets", async () => {
    const user = userEvent.setup();
    render(<MetaAutoAcceptDialog source="uvsgames" onClose={vi.fn()} />);

    await user.click(await screen.findByRole("switch", { name: "Field size of at least" }));
    await user.click(screen.getByRole("button", { name: "Save rules" }));

    expect(captured.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ autoAcceptMinPlayers: null }),
    );
  });

  it("refuses to save a field size that is not a whole number of players", async () => {
    const user = userEvent.setup();
    render(<MetaAutoAcceptDialog source="uvsgames" onClose={vi.fn()} />);

    await user.clear(await screen.findByLabelText("Minimum field size"));

    expect(screen.getByText("Enter a whole number of players above zero.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save rules" })).toBeDisabled();
  });

  it("closes without saving when the form is cancelled", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<MetaAutoAcceptDialog source="uvsgames" onClose={onClose} />);

    await user.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
    expect(captured.updateSettings).not.toHaveBeenCalled();
  });

  it("hides the template rules on a source that publishes no templates", async () => {
    render(<MetaAutoAcceptDialog source="playloltcg" onClose={vi.fn()} />);

    expect(await screen.findByLabelText("Minimum field size")).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /template you watch/u })).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: /notable vocabulary/u })).not.toBeInTheDocument();
  });

  it("keeps the hidden template rules as they were stored", async () => {
    const user = userEvent.setup();
    render(<MetaAutoAcceptDialog source="playloltcg" onClose={vi.fn()} />);

    await user.click(await screen.findByRole("button", { name: "Save rules" }));

    expect(captured.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ autoAcceptNotable: true, autoAcceptOfficial: false }),
    );
  });

  it("says the threshold reaches the other source, since one row governs both", async () => {
    render(<MetaAutoAcceptDialog source="playloltcg" onClose={vi.fn()} />);

    expect(await screen.findByText(/also governs UVS Games/u)).toBeInTheDocument();
  });

  it("names the source whose standings an auto-accept publishes", async () => {
    render(<MetaAutoAcceptDialog source="playloltcg" onClose={vi.fn()} />);

    expect(await screen.findByText(/Play LoL TCG standings/u)).toBeInTheDocument();
  });
});
