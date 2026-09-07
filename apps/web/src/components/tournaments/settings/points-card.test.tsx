import type { TournamentDetailResponse } from "@openrift/shared/types/api/tournament";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateMutateAsync = vi.fn();

vi.mock("@/hooks/use-tournaments", () => ({
  useUpdateTournament: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const { PointsCard } = await import("./points-card");

function makeDetail(overrides: Partial<TournamentDetailResponse> = {}): TournamentDetailResponse {
  return {
    id: "tournament-1",
    name: "Summoner Skirmish",
    pairingStyle: "swiss",
    winPoints: 3,
    drawPoints: 1,
    byePoints: 3,
    ...overrides,
  } as unknown as TournamentDetailResponse;
}

beforeEach(() => {
  updateMutateAsync.mockClear();
  updateMutateAsync.mockResolvedValue(undefined);
});

describe("PointsCard fields", () => {
  it("offers win and draw alongside bye for Swiss", () => {
    render(<PointsCard detail={makeDetail()} locked={false} />);

    expect(screen.getByLabelText("Points for a match win")).toBeInTheDocument();
    expect(screen.getByLabelText("Points for a draw")).toBeInTheDocument();
    expect(screen.getByLabelText("Points for a bye")).toBeInTheDocument();
  });

  it("offers only bye for a pod event", () => {
    render(<PointsCard detail={makeDetail({ pairingStyle: "pod" })} locked={false} />);

    expect(screen.getByLabelText("Points for a bye")).toBeInTheDocument();
    expect(screen.queryByLabelText("Points for a match win")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Points for a draw")).not.toBeInTheDocument();
  });
});

describe("PointsCard validation", () => {
  it("keeps Save disabled until something actually changes", async () => {
    const user = userEvent.setup();
    render(<PointsCard detail={makeDetail()} locked={false} />);

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

    await user.clear(screen.getByLabelText("Points for a bye"));
    await user.type(screen.getByLabelText("Points for a bye"), "2");

    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it.each([
    ["a three-digit value", "100"],
    ["a decimal", "1.5"],
    ["a negative", "-1"],
    ["empty", ""],
  ])("rejects %s", async (_label, value) => {
    const user = userEvent.setup();
    render(<PointsCard detail={makeDetail()} locked={false} />);

    await user.clear(screen.getByLabelText("Points for a bye"));
    if (value !== "") {
      await user.type(screen.getByLabelText("Points for a bye"), value);
    }

    expect(screen.getByText(/whole numbers between 0 and 99/u)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("accepts 0 and 99 at the boundaries", async () => {
    const user = userEvent.setup();
    render(<PointsCard detail={makeDetail()} locked={false} />);

    await user.clear(screen.getByLabelText("Points for a bye"));
    await user.type(screen.getByLabelText("Points for a bye"), "0");
    expect(screen.queryByText(/whole numbers between 0 and 99/u)).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Points for a bye"));
    await user.type(screen.getByLabelText("Points for a bye"), "99");
    expect(screen.queryByText(/whole numbers between 0 and 99/u)).not.toBeInTheDocument();
  });

  it("blocks the save when a Swiss-only field is invalid", async () => {
    const user = userEvent.setup();
    render(<PointsCard detail={makeDetail()} locked={false} />);

    await user.clear(screen.getByLabelText("Points for a match win"));

    expect(screen.getByText(/whole numbers between 0 and 99/u)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("ignores a blank win field for a pod event", async () => {
    const user = userEvent.setup();
    render(<PointsCard detail={makeDetail({ pairingStyle: "pod" })} locked={false} />);

    await user.clear(screen.getByLabelText("Points for a bye"));
    await user.type(screen.getByLabelText("Points for a bye"), "1");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateMutateAsync).toHaveBeenCalledWith({
      id: "tournament-1",
      byePoints: 1,
      winPoints: undefined,
      drawPoints: undefined,
    });
  });

  it("sends win and draw for a Swiss event", async () => {
    const user = userEvent.setup();
    render(<PointsCard detail={makeDetail()} locked={false} />);

    await user.clear(screen.getByLabelText("Points for a match win"));
    await user.type(screen.getByLabelText("Points for a match win"), "4");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(updateMutateAsync).toHaveBeenCalledWith({
      id: "tournament-1",
      byePoints: 3,
      winPoints: 4,
      drawPoints: 1,
    });
  });
});

describe("PointsCard locked state", () => {
  it("disables every control on a cancelled tournament", () => {
    render(<PointsCard detail={makeDetail()} locked />);

    expect(screen.getByLabelText("Points for a match win")).toBeDisabled();
    expect(screen.getByLabelText("Points for a bye")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
});
