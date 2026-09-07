import { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const chain = {
      middleware: () => chain,
      validator: () => chain,
      handler: (fn: () => unknown) => () => fn(),
    };
    return chain;
  },
}));

const get = vi.fn();
vi.mock("./server-fns/orpc-client", () => ({ apiOrpcClient: () => ({ get: () => get() }) }));

async function loadQueryOptions() {
  vi.resetModules();
  const { siteSettingsQueryOptions } = await import("./site-settings");
  return siteSettingsQueryOptions;
}

beforeEach(() => {
  get.mockReset();
});

describe("siteSettingsQueryOptions", () => {
  it("resolves the settings map the API returns", async () => {
    get.mockResolvedValue({ settings: { announcement: "Patch 1.3 is live" } });
    const options = await loadQueryOptions();

    await expect(new QueryClient().query(options)).resolves.toEqual({
      announcement: "Patch 1.3 is live",
    });
  });

  it("hits the API once across per-request query clients", async () => {
    get.mockResolvedValue({ settings: { announcement: "Patch 1.3 is live" } });
    const options = await loadQueryOptions();

    await new QueryClient().query(options);
    await new QueryClient().query(options);

    expect(get).toHaveBeenCalledOnce();
  });

  it("rejects when the API call fails", async () => {
    get.mockRejectedValue(new Error("site-settings unavailable"));
    const options = await loadQueryOptions();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await expect(client.query(options)).rejects.toThrow("site-settings unavailable");
  });
});
