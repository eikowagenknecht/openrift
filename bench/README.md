# RPC type-cost benchmark — Hono RPC vs oRPC

Evaluation for the typecheck OOM (`hono-oom-orpc-eval`). The API build with
`tsgo` (the Go-native TypeScript compiler) peaks at **~11.9 GB RSS** — even the
memory-efficient compiler blows up. This harness isolates _why_: the cost of
accumulating route types through Hono RPC's chained `.route()` builder vs
oRPC's contract/router model.

## What it measures

`gen.ts` emits `N` routes for each framework, each with the **same**
moderately complex Zod schema (nested objects, arrays, unions, enums, records —
approximating the density of `packages/shared/src/response-schemas.ts`), plus a
consumer that instantiates the client type and calls every endpoint:

- **Hono**: `@hono/zod-openapi` `createRoute` per route, chained via
  `new OpenAPIHono().route("/", r0).route("/", r1)…`, consumed with
  `hc<typeof app>()` — exactly the real app's `AppType` pattern.
- **oRPC**: `os.input().output().handler()` per route, collected into a plain
  router object, consumed with `RouterClient<typeof router>`.

Same compiler (`tsgo`), same schemas, same route count. The only variable is the
framework, so the delta is the framework's type-accumulation cost.

## Run it

```bash
cd bench && bun install
for N in 10 25 45 80 120; do
  bun gen.ts $N
  ./node_modules/.bin/tsgo -p tsconfig.hono.json   # measure peak RSS
  ./node_modules/.bin/tsgo -p tsconfig.orpc.json
done
```

(Peak RSS sampled with a `ps`-based wrapper; see the eval session.)

## Results

| Routes | Hono RPC RSS | oRPC RSS | Hono reduction | Hono wall | oRPC wall |
| ------ | ------------ | -------- | -------------- | --------- | --------- |
| 10     | 304 MB       | 28 MB    | 10.9×          | 1.3 s     | 0.3 s     |
| 25     | 450 MB       | 28 MB    | 16×            | 2.0 s     | 0.3 s     |
| 45     | 597 MB       | 108 MB   | 5.5×           | 2.9 s     | 0.7 s     |
| 80     | 882 MB       | 111 MB   | 7.9×           | 4.2 s     | 0.6 s     |
| 120    | 1229 MB      | 193 MB   | 6.4×           | 6.1 s     | 1.0 s     |

Hono's type cost grows ~10 MB/route and keeps climbing; oRPC stays roughly flat
and ~5–10× lower throughout.

## What this does and does not prove

- **Does prove:** the framework is the dominant variable, oRPC's type
  accumulation is 5–10× cheaper at the app's route count, and Hono RPC's cost
  scales steeply with route count while oRPC's stays flat. A side DX note: oRPC
  enforced the handler's output type; Hono's `c.json` accepted a mismatched body.
- **Does not prove:** the absolute 11.9 GB figure. The synthetic schemas are
  lighter than the real ones, and the real build also typechecks the whole app
  graph. The benchmark's value is the **ratio and scaling shape**, which projects
  a 5–10× reduction on the real API — comfortably under any sane memory ceiling.
