import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RefreshCountdownButton } from "./refresh-countdown-button";

const NOW = Date.UTC(2026, 7, 30, 12, 0, 0);

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function renderButton(props: Partial<Parameters<typeof RefreshCountdownButton>[0]> = {}) {
  return render(
    <RefreshCountdownButton
      onRefresh={vi.fn()}
      isFetching={false}
      dataUpdatedAt={NOW}
      intervalMs={30_000}
      {...props}
    />,
  );
}

describe("RefreshCountdownButton", () => {
  it("counts down to the next automatic fetch", () => {
    renderButton();

    expect(screen.getByRole("button")).toHaveTextContent("Refresh30s");
  });

  it("hides the countdown while a fetch is in flight", () => {
    renderButton({ isFetching: true });

    expect(screen.getByRole("button")).toHaveTextContent(/^Refresh$/u);
  });

  it("hides the countdown before the first successful fetch", () => {
    renderButton({ dataUpdatedAt: 0 });

    expect(screen.getByRole("button")).toHaveTextContent(/^Refresh$/u);
  });

  it("hides the countdown on a view that does not poll", () => {
    renderButton({ intervalMs: false });

    expect(screen.getByRole("button")).toHaveTextContent(/^Refresh$/u);
  });

  it("carries the last-updated stamp as the button's tooltip", () => {
    renderButton();

    expect(screen.getByRole("button")).toHaveAttribute("title", expect.stringMatching(/^Last /u));
  });

  it("leaves the tooltip off until there is a stamp to show", () => {
    renderButton({ dataUpdatedAt: 0 });

    expect(screen.getByRole("button")).not.toHaveAttribute("title");
  });

  it("refreshes on click", async () => {
    const onRefresh = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderButton({ onRefresh });

    await user.click(screen.getByRole("button"));

    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("does not refresh while already fetching", async () => {
    const onRefresh = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderButton({ onRefresh, isFetching: true });

    await user.click(screen.getByRole("button"));

    expect(onRefresh).not.toHaveBeenCalled();
  });
});
