// TanStack Start 1.167+ encodes server-fn POST bodies via seroval's
// `toJSONAsync` output ({ t: { t: 10, p: { k, v } }, ... }, scalars as
// { t: 0|1|2, s }). Tests don't pull in seroval, so decode just enough to
// reach ordinary objects/arrays/primitives back out of the AST.

interface SerovalEnvelope {
  t: SerovalNode;
}

interface SerovalNode {
  t: number;
  s?: unknown;
  p?: { k: string[]; v: SerovalNode[] };
  l?: number;
  a?: SerovalNode[];
}

function decodeSerovalNode(node: SerovalNode): unknown {
  // t=0 number, t=1 string, t=2 bool (s=2 true, s=3 false), t=3 null, t=4 undefined.
  switch (node.t) {
    case 0: {
      return node.s;
    }
    case 1: {
      return node.s;
    }
    case 2: {
      return node.s === 2;
    }
    case 3: {
      return null;
    }
    case 4: {
      return undefined;
    }
    case 9: {
      return (node.a ?? []).map((entry) => decodeSerovalNode(entry));
    }
    case 10: {
      const out: Record<string, unknown> = {};
      const p = node.p;
      if (p) {
        for (const [index, key] of p.k.entries()) {
          const child = p.v[index];
          if (child !== undefined) {
            out[key] = decodeSerovalNode(child);
          }
        }
      }
      return out;
    }
    default: {
      return undefined;
    }
  }
}

// Returns the value under the top-level `data` key, since that's what every
// call site wants.
export function decodeServerFnData<T = unknown>(rawBody: unknown): T {
  const envelope = rawBody as SerovalEnvelope | { data: unknown } | undefined;
  if (envelope && typeof envelope === "object" && "t" in envelope && envelope.t) {
    const decoded = decodeSerovalNode(envelope.t) as { data?: T } | undefined;
    return (decoded?.data ?? {}) as T;
  }
  if (envelope && typeof envelope === "object" && "data" in envelope) {
    return (envelope as { data: T }).data ?? ({} as T);
  }
  return {} as T;
}
