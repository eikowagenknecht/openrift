export interface DiffSegment {
  text: string;
  type: "equal" | "added" | "removed";
}

type DiffGranularity = "word" | "char";

const WORD_TOKENS = /\w+|\s+|[^\w\s]+/gu;

function tokenize(text: string, granularity: DiffGranularity): string[] {
  if (granularity === "char") {
    return [...text];
  }
  return text.match(WORD_TOKENS) ?? [];
}

function merge(segments: DiffSegment[]): DiffSegment[] {
  const out: DiffSegment[] = [];
  for (const seg of segments) {
    const last = out.at(-1);
    if (last && last.type === seg.type) {
      last.text += seg.text;
    } else {
      out.push({ ...seg });
    }
  }
  return out;
}

function lcsCell(dp: number[][], row: number, column: number): number {
  const value = dp[row]?.[column];
  if (value === undefined) {
    throw new Error(`textDiff: no LCS cell at ${row},${column}`);
  }
  return value;
}

export function textDiff(
  oldText: string,
  newText: string,
  options: { granularity?: DiffGranularity } = {},
): DiffSegment[] {
  if (oldText === newText) {
    return [{ text: oldText, type: "equal" }];
  }
  if (!oldText) {
    return [{ text: newText, type: "added" }];
  }
  if (!newText) {
    return [{ text: oldText, type: "removed" }];
  }

  const granularity = options.granularity ?? "word";
  const oldTokens = tokenize(oldText, granularity);
  const newTokens = tokenize(newText, granularity);
  const n = oldTokens.length;
  const m = newTokens.length;

  const dp: number[][] = [Array.from({ length: m + 1 }, () => 0)];
  for (const [oldIndex, oldToken] of oldTokens.entries()) {
    const row: number[] = [0];
    let left = 0;
    for (const [newIndex, newToken] of newTokens.entries()) {
      const value =
        oldToken === newToken
          ? lcsCell(dp, oldIndex, newIndex) + 1
          : Math.max(lcsCell(dp, oldIndex, newIndex + 1), left);
      row.push(value);
      left = value;
    }
    dp.push(row);
  }

  const reversed: DiffSegment[] = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    const oldToken = oldTokens[i - 1];
    const newToken = newTokens[j - 1];
    if (oldToken !== undefined && oldToken === newToken) {
      reversed.push({ text: oldToken, type: "equal" });
      i--;
      j--;
    } else if (
      newToken !== undefined &&
      (oldToken === undefined || lcsCell(dp, i, j - 1) >= lcsCell(dp, i - 1, j))
    ) {
      reversed.push({ text: newToken, type: "added" });
      j--;
    } else if (oldToken === undefined) {
      throw new Error("textDiff: LCS backtrack ran past both token lists");
    } else {
      reversed.push({ text: oldToken, type: "removed" });
      i--;
    }
  }

  reversed.reverse();
  return merge(reversed);
}
