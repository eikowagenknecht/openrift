// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

interface LinkOptions {
  url: string | (() => string);
  headers?: () => Record<string, string>;
}
const linkOptions: LinkOptions[] = [];

interface CapturedLink {
  call: (path: readonly string[], input: unknown, options: unknown) => Promise<unknown>;
}
const mockLinkCall = vi.fn<() => Promise<unknown>>(() => Promise.resolve("ok"));
const builtLinks: CapturedLink[] = [];

vi.mock("@orpc/openapi-client/fetch", () => ({
  // Must be a named function, not an arrow: called with `new`.
  OpenAPILink: function OpenAPILink(this: CapturedLink, _contract: unknown, options: LinkOptions) {
    linkOptions.push(options);
    this.call = () => mockLinkCall();
  },
}));
vi.mock("@orpc/client", () => ({
  createORPCClient: vi.fn((link: CapturedLink) => {
    builtLinks.push(link);
    return {};
  }),
}));
vi.mock("./api-url", () => ({ getApiUrl: () => "https://api.test" }));

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
const { taggedProcedure } = await import("@/lib/orpc-procedure-tag");

const dummyContract = {} as never;
const headersOf = (index = 0): Record<string, string> => linkOptions[index]!.headers?.() ?? {};

beforeEach(() => {
  linkOptions.length = 0;
  builtLinks.length = 0;
  mockLinkCall.mockReset();
  mockLinkCall.mockResolvedValue("ok");
  mockActiveClientIp.mockReset();
  mockActiveClientIp.mockReturnValue(undefined);
  mockInject.mockClear();
});

describe("apiOrpcClient", () => {
  it("targets getApiUrl() and forwards the SSR cookie", () => {
    apiOrpcClient(dummyContract, "session=abc");
    expect(linkOptions).toHaveLength(1);
    expect(linkOptions[0]!.url).toBe("https://api.test");
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
    const { url } = linkOptions[0]!;
    expect(typeof url).toBe("function");
    expect((url as () => string)()).toBe(globalThis.location.origin);
    expect(linkOptions[0]!.headers).toBeUndefined();
  });

  it("does not read location while building the link", () => {
    const location = globalThis.location;
    Reflect.deleteProperty(globalThis, "location");
    try {
      expect(() => browserApiOrpcClient(dummyContract)).not.toThrow();
    } finally {
      Object.defineProperty(globalThis, "location", {
        configurable: true,
        value: location,
        writable: true,
      });
    }
  });
});

describe("procedure tagging", () => {
  it("records the failing procedure on the error a call rejects with", async () => {
    mockLinkCall.mockRejectedValue(new Error("Internal server error"));
    apiOrpcClient(dummyContract);

    await expect(builtLinks[0]!.call(["meta", "events"], {}, {})).rejects.toSatisfy(
      (error: unknown) => taggedProcedure(error) === "meta.events",
    );
  });

  it("tags a browser client's calls too", async () => {
    mockLinkCall.mockRejectedValue(new Error("Internal server error"));
    browserApiOrpcClient(dummyContract);

    await expect(builtLinks[0]!.call(["cards"], {}, {})).rejects.toSatisfy(
      (error: unknown) => taggedProcedure(error) === "cards",
    );
  });

  it("passes a resolved call straight through", async () => {
    apiOrpcClient(dummyContract);

    await expect(builtLinks[0]!.call(["cards"], {}, {})).resolves.toBe("ok");
  });

  it("leaves a thrown non-object alone", async () => {
    // oxlint-disable-next-line typescript/only-throw-error -- a bare throw is what this guards
    mockLinkCall.mockRejectedValue("boom");
    apiOrpcClient(dummyContract);

    await expect(builtLinks[0]!.call(["cards"], {}, {})).rejects.toBe("boom");
  });
});
