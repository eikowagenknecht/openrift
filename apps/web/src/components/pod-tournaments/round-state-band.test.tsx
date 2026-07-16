import type { PodResponse, PodRoundResponse } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CompletedRoundsBand, OpenRoundBand } from "./round-state-band";

function makePod(id: string, resultStatus: PodResponse["resultStatus"]): PodResponse {
  return {
    id,
    podNumber: Number(id.at(-1)),
    size: 4,
    resultStatus,
    members: [],
    penalty: null,
  };
}

function makeRound(pods: PodResponse[]): PodRoundResponse {
  return {
    id: "round-3",
    roundNumber: 3,
    status: "reporting",
    pairingStrategy: "pod",
    penaltyTotal: 0,
    createdAt: "2026-07-01T10:00:00Z",
    finalizedAt: null,
    pods,
    byes: [],
  };
}

describe("OpenRoundBand", () => {
  it("leads with the reported/total split and how far through the event the round is", () => {
    render(
      <OpenRoundBand
        round={makeRound([
          makePod("pod-1", "reported"),
          makePod("pod-2", "reported"),
          makePod("pod-3", "pending"),
          makePod("pod-4", "pending"),
        ])}
        suggested={4}
        finalizing={false}
        onFinalize={vi.fn()}
      />,
    );

    expect(screen.getByText("Round 3")).toBeInTheDocument();
    expect(screen.getByText("2/4")).toBeInTheDocument();
    expect(screen.getByText("pods reported · round 3 of ~4")).toBeInTheDocument();
    expect(screen.getByText("Reporting")).toBeInTheDocument();
  });

  it("tracks progress at the share of pods reported", () => {
    render(
      <OpenRoundBand
        round={makeRound([
          makePod("pod-1", "reported"),
          makePod("pod-2", "pending"),
          makePod("pod-3", "pending"),
          makePod("pod-4", "pending"),
        ])}
        suggested={4}
        finalizing={false}
        onFinalize={vi.fn()}
      />,
    );

    const progress = screen.getByRole("progressbar", { name: "1 of 4 pods reported" });
    expect(progress).toHaveAttribute("aria-valuenow", "25");
  });

  it("calls a round of 1v1 pods matches", () => {
    const round = makeRound([makePod("pod-1", "reported")]);
    round.pods[0].size = 2;
    render(<OpenRoundBand round={round} suggested={0} finalizing={false} onFinalize={vi.fn()} />);

    expect(screen.getByText("matches reported")).toBeInTheDocument();
  });

  it("only allows finalizing once every pod has reported", async () => {
    const user = userEvent.setup();
    const onFinalize = vi.fn();
    const { rerender } = render(
      <OpenRoundBand
        round={makeRound([makePod("pod-1", "reported"), makePod("pod-2", "pending")])}
        suggested={4}
        finalizing={false}
        onFinalize={onFinalize}
      />,
    );

    expect(screen.getByRole("button", { name: "Finalize round" })).toBeDisabled();

    rerender(
      <OpenRoundBand
        round={makeRound([makePod("pod-1", "reported"), makePod("pod-2", "reported")])}
        suggested={4}
        finalizing={false}
        onFinalize={onFinalize}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Finalize round" }));

    expect(onFinalize).toHaveBeenCalledOnce();
  });
});

describe("CompletedRoundsBand", () => {
  it("reports the finished tournament as read-only", () => {
    render(<CompletedRoundsBand finalizedCount={4} />);

    expect(screen.getByText("Tournament over")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText(/rounds finalized/u)).toBeInTheDocument();
    expect(screen.getByText("Read-only")).toBeInTheDocument();
  });
});
