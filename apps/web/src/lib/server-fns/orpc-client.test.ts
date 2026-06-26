// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

// Capture what `apiOrpcClient` / `browserApiOrpcClient` hand to the oRPC link so
// we can assert the request URL and exercise the lazily-built `headers()` fn.
interface LinkOptions {
  url: string;
  headers?: () => Record<string, string>;
}
const linkOptions: LinkOptions[] = [];

vi.mock("@orpc/openapi-client/fetch", () => ({
  // `new OpenAPILink(contract, options)` — a named function so it is constructable.
  OpenAPILink: function OpenAPILink(_contract: unknown, options: LinkOptions) {
    linkOptions.push(options);
  },
}));
vi.mock("@orpc/client", () => ({ createORPCClient: vi.fn(() => ({})) }));
vi.mock("./api-url", () => ({ API_URL: "https://api.test" }));

const mockActiveClientIp = vi.fn<() => string | undefined>(() => undefined);
vi.mock("./client-ip-context", () => ({ activeClientIp: () => mockActiveClientIp() }));

const mockInject = vi.fn((_ctx: unknown, carrier: Record<string, string>) => {
  carrier.traceparent = "00-trace-span-01";
});
vi.mock("@opentelemetry/api", () => ({
  context: { active: () => ({}) },
  propagation: {
    inject: (ctx: unknown, carrier: Record<string, string>) => mockInject(ctx, carrier),
  },
}));

const { apiOrpcClient, browserApiOrpcClient } = await import("./orpc-client");

const dummyContract = {} as never;
const headersOf = (index = 0): Record<string, string> => linkOptions[index].headers?.() ?? {};

beforeEach(() => {
  linkOptions.length = 0;
  mockActiveClientIp.mockReset();
  mockActiveClientIp.mockReturnValue(undefined);
  mockInject.mockClear();
});

describe("apiOrpcClient", () => {
  it("targets API_URL and forwards the SSR cookie", () => {
    apiOrpcClient(dummyContract, "session=abc");
    expect(linkOptions).toHaveLength(1);
    expect(linkOptions[0].url).toBe("https://api.test");
    expect(headersOf().cookie).toBe("session=abc");
  });

  it("omits the cookie header when no cookie is provided", () => {
    apiOrpcClient(dummyContract);
    expect(headersOf().cookie).toBeUndefined();
  });

  it("injects the W3C traceparent so the API continues the trace", () => {
    apiOrpcClient(dummyContract, "session=abc");
    const headers = headersOf();
    expect(mockInject).toHaveBeenCalledTimes(1);
    expect(headers.traceparent).toBe("00-trace-span-01");
  });

  it("forwards the real visitor IP when one is active", () => {
    mockActiveClientIp.mockReturnValue("203.0.113.7");
    apiOrpcClient(dummyContract, "session=abc");
    expect(headersOf()["x-real-ip"]).toBe("203.0.113.7");
  });

  it("omits x-real-ip when there is no active client IP", () => {
    mockActiveClientIp.mockReturnValue(undefined);
    apiOrpcClient(dummyContract, "session=abc");
    expect(headersOf()["x-real-ip"]).toBeUndefined();
  });
});

describe("browserApiOrpcClient", () => {
  it("targets the current origin and forwards no header logic", () => {
    browserApiOrpcClient(dummyContract);
    expect(linkOptions).toHaveLength(1);
    expect(linkOptions[0].url).toBe(globalThis.location.origin);
    expect(linkOptions[0].headers).toBeUndefined();
  });
});
