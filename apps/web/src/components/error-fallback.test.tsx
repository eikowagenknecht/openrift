import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "./error-fallback";

describe("ErrorBoundary", () => {
  it("renders children when there is no error", () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("renders an error UI when a child throws", () => {
    // Suppress React's error boundary console.error noise in test output
    const spy = vi.spyOn(console, "error").mockImplementation(vi.fn());

    function Bomb(): never {
      throw new Error("kaboom");
    }

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    // Should show the error stack trace
    expect(screen.getByText(/kaboom/)).toBeInTheDocument();
    // Should show action buttons
    expect(screen.getByText("Reshuffle")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");

    spy.mockRestore();
  });

  it("reload button calls location.reload", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(vi.fn());
    const reloadMock = vi.fn();

    // Mock location.reload
    Object.defineProperty(globalThis, "location", {
      value: { ...globalThis.location, reload: reloadMock },
      writable: true,
    });

    function Bomb(): never {
      throw new Error("test error");
    }

    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );

    const user = userEvent.setup();
    await user.click(screen.getByText("Reshuffle"));
    expect(reloadMock).toHaveBeenCalled();

    spy.mockRestore();
  });
});
