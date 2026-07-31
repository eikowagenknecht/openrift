import type { Printing } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { createContentAddressedCache } from "./catalog-assembly.js";

const printing = (id: string): Printing => ({ id }) as unknown as Printing;

describe("createContentAddressedCache", () => {
  it("assembles once and reuses the memo while the version is unchanged", async () => {
    let assembleCalls = 0;
    const cache = createContentAddressedCache(
      async () => {
        assembleCalls += 1;
        return [printing(`p${assembleCalls}`)];
      },
      async () => "v1",
    );

    const first = await cache();
    const second = await cache();

    expect(assembleCalls).toBe(1);
    expect(first).toBe(second);
    expect(first).toEqual([printing("p1")]);
  });

  it("reassembles immediately when the version token rolls", async () => {
    let assembleCalls = 0;
    let version = "v1";
    const cache = createContentAddressedCache(
      async () => {
        assembleCalls += 1;
        return [printing(`p${assembleCalls}`)];
      },
      async () => version,
    );

    await cache();
    version = "v2";
    const refreshed = await cache();

    expect(assembleCalls).toBe(2);
    expect(refreshed).toEqual([printing("p2")]);
  });

  it("a burst on a new version triggers a single shared assembly", async () => {
    let assembleCalls = 0;
    let probeCalls = 0;
    const cache = createContentAddressedCache(
      async () => {
        assembleCalls += 1;
        return [printing("p")];
      },
      async () => {
        probeCalls += 1;
        return "v1";
      },
    );

    const [first, second, third] = await Promise.all([cache(), cache(), cache()]);

    expect(assembleCalls).toBe(1);
    // Concurrent probes coalesce into one.
    expect(probeCalls).toBe(1);
    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it("does not cache a rejected assembly — the next call retries", async () => {
    let assembleCalls = 0;
    const cache = createContentAddressedCache(
      async () => {
        assembleCalls += 1;
        if (assembleCalls === 1) {
          throw new Error("boom");
        }
        return [printing("ok")];
      },
      async () => "v1",
    );

    await expect(cache()).rejects.toThrow("boom");
    const recovered = await cache();

    expect(assembleCalls).toBe(2);
    expect(recovered).toEqual([printing("ok")]);
  });

  it("serves the last good catalog when a probe transiently fails", async () => {
    let assembleCalls = 0;
    let probeShouldFail = false;
    const cache = createContentAddressedCache(
      async () => {
        assembleCalls += 1;
        return [printing("cached")];
      },
      async () => {
        if (probeShouldFail) {
          throw new Error("probe down");
        }
        return "v1";
      },
    );

    const first = await cache();
    probeShouldFail = true;
    const duringOutage = await cache();

    expect(assembleCalls).toBe(1);
    expect(duringOutage).toBe(first);
  });

  it("propagates the probe error when there is no cached catalog yet", async () => {
    const cache = createContentAddressedCache(
      async () => [printing("never")],
      async () => {
        throw new Error("probe down");
      },
    );

    await expect(cache()).rejects.toThrow("probe down");
  });
});
