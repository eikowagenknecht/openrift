import { context, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { instrumentRepo } from "./instrumented-repo.js";

const exporter = new InMemorySpanExporter();
const provider = new BasicTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(exporter)],
});
const contextManager = new AsyncLocalStorageContextManager();

beforeAll(() => {
  trace.setGlobalTracerProvider(provider);
  context.setGlobalContextManager(contextManager.enable());
});

afterAll(async () => {
  contextManager.disable();
  await provider.shutdown();
  trace.disable();
  context.disable();
});

afterEach(() => {
  exporter.reset();
});

describe("instrumentRepo", () => {
  it("opens a span named repo.<name>.<method> per call and returns the result", async () => {
    const repo = instrumentRepo("test", {
      double: async (x: number) => x * 2,
    });

    const result = await repo.double(21);

    expect(result).toBe(42);
    const spans = exporter.getFinishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("repo.test.double");
  });

  it("works with non-async functions that return Promises (Kysely pattern)", async () => {
    const repo = instrumentRepo("test", {
      addOne: (x: number) => Promise.resolve(x + 1),
    });

    const result = await repo.addOne(5);

    expect(result).toBe(6);
    expect(exporter.getFinishedSpans()[0]?.name).toBe("repo.test.addOne");
  });

  it("records exceptions on the span and rethrows", async () => {
    const repo = instrumentRepo("test", {
      boom: async () => {
        throw new Error("kaboom");
      },
    });

    await expect(repo.boom()).rejects.toThrow("kaboom");

    const span = exporter.getFinishedSpans()[0];
    expect(span?.status.code).toBe(2);
    expect(span?.events.some((event) => event.name === "exception")).toBe(true);
  });

  it("passes non-function properties through unchanged", () => {
    const repo = instrumentRepo("test", {
      version: "1.0",
      maxRetries: 3,
      noop: async () => undefined,
    });

    expect(repo.version).toBe("1.0");
    expect(repo.maxRetries).toBe(3);
  });

  it("preserves `this` so methods can call sibling methods via this.x()", async () => {
    const repo = instrumentRepo("test", {
      async getOne(): Promise<number> {
        return 1;
      },
      async addOne(this: { getOne: () => Promise<number> }): Promise<number> {
        const one = await this.getOne();
        return one + 1;
      },
    });

    await expect(repo.addOne()).resolves.toBe(2);

    const spans = exporter.getFinishedSpans();
    expect(spans.map((span) => span.name).sort()).toEqual(["repo.test.addOne", "repo.test.getOne"]);
  });

  it("creates child spans inside an active parent", async () => {
    const tracer = trace.getTracer("test-parent");
    const repo = instrumentRepo("inner", {
      ping: async () => "pong",
    });

    await tracer.startActiveSpan("parent", async (parent) => {
      try {
        await repo.ping();
      } finally {
        parent.end();
      }
    });

    const spans = exporter.getFinishedSpans();
    const child = spans.find((span) => span.name === "repo.inner.ping");
    const parent = spans.find((span) => span.name === "parent");
    expect(child).toBeDefined();
    expect(parent).toBeDefined();
    expect(child?.parentSpanContext?.spanId).toBe(parent?.spanContext().spanId);
  });
});
