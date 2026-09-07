// oxlint-disable-next-line typescript/no-explicit-any -- a recursive JSON type resolves to a union at every leaf and blocks ordinary property access
export type JsonBody = any;

export async function readJson<T = JsonBody>(res: Response): Promise<T> {
  return (await res.json()) as T;
}
