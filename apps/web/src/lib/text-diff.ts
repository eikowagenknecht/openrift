export interface DiffSegment {
  text: string;
  type: "equal" | "added" | "removed";
}

export type DiffGranularity = "word" | "char";

const WORD_TOKENS = /\w+|\s+|[^\w\s]+/g;

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

/**
 * Compute a diff between two strings using LCS.
 *
 * Segments are tagged as:
 * - "equal"   — text present in both
 * - "removed" — text only in `oldText`
 * - "added"   — text only in `newText`
 *
 * `granularity` controls the unit of comparison:
 * - "word" (default) — words, whitespace runs, and punctuation runs
 * - "char" — individual characters; use when sub-word changes matter
 *   (typography, smart quotes, accents)
 *
 * @returns Merged diff segments
 */
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

  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array.from({ length: m + 1 }, () => 0),
  );

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] =
        oldTokens[i - 1] === newTokens[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const reversed: DiffSegment[] = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
      reversed.push({ text: oldTokens[i - 1], type: "equal" });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      reversed.push({ text: newTokens[j - 1], type: "added" });
      j--;
    } else {
      reversed.push({ text: oldTokens[i - 1], type: "removed" });
      i--;
    }
  }

  reversed.reverse();
  return merge(reversed);
}
