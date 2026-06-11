import { context, ROOT_CONTEXT } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { activeClientIp, contextWithClientIp } from "./client-ip-context";

const contextManager = new AsyncLocalStorageContextManager();

beforeAll(() => {
  context.setGlobalContextManager(contextManager.enable());
});

afterAll(() => {
  contextManager.disable();
  context.disable();
});

describe("client-ip-context", () => {
  it("round-trips an IP through the active context", () => {
    const ctx = contextWithClientIp(ROOT_CONTEXT, "203.0.113.7");
    const seen = context.with(ctx, () => activeClientIp());
    expect(seen).toBe("203.0.113.7");
  });

  it("supports IPv6 addresses", () => {
    const ctx = contextWithClientIp(ROOT_CONTEXT, "2400:cb00::1");
    expect(context.with(ctx, () => activeClientIp())).toBe("2400:cb00::1");
  });

  it("returns undefined outside a request scope", () => {
    expect(activeClientIp()).toBeUndefined();
  });

  it("returns undefined for an empty value", () => {
    const ctx = contextWithClientIp(ROOT_CONTEXT, "");
    expect(context.with(ctx, () => activeClientIp())).toBeUndefined();
  });

  it("does not leak the IP outside the scoped context", () => {
    const ctx = contextWithClientIp(ROOT_CONTEXT, "203.0.113.7");
    context.with(ctx, () => activeClientIp());
    expect(activeClientIp()).toBeUndefined();
  });
});
