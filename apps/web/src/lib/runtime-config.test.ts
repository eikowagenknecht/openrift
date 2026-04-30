import { describe, expect, it } from "vitest";

import { runtimeConfigScript } from "./runtime-config";

// oxlint-disable unicorn/prefer-string-raw -- explicit \u escapes assert exact output shape; String.raw would defeat the readability in assertions

describe("runtimeConfigScript", () => {
  it("serializes a Sentry DSN onto globalThis", () => {
    const script = runtimeConfigScript("https://abc@o0.ingest.sentry.io/1");
    expect(script).toBe(
      'globalThis.__OPENRIFT_CONFIG__={"sentryDsn":"https://abc@o0.ingest.sentry.io/1"};',
    );
  });

  it("defaults missing DSN to an empty string", () => {
    const script = runtimeConfigScript("");
    expect(script).toBe('globalThis.__OPENRIFT_CONFIG__={"sentryDsn":""};');
  });

  it("escapes '</' so a DSN cannot close the surrounding <script> block", () => {
    const script = runtimeConfigScript("</script><script>alert(1)</script>");
    expect(script).not.toContain("</script>");
    expect(script).toContain("\\u003c/script>");
  });

  it("escapes U+2028 and U+2029 line separators", () => {
    const lineSep = String.fromCodePoint(0x20_28);
    const paraSep = String.fromCodePoint(0x20_29);
    const script = runtimeConfigScript(`pre${lineSep}mid${paraSep}post`);
    expect(script).not.toContain(lineSep);
    expect(script).not.toContain(paraSep);
    expect(script).toContain("\\u2028");
    expect(script).toContain("\\u2029");
  });
});
