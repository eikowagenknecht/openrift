export function formatRuleNumber(ruleNumber: string): string {
  return ruleNumber.replace(/\.$/u, "");
}

// Tail is bounded (optional .digit segments, one optional .letter, final optional .digit)
// so "rule 540.4.b. Continue" matches "540.4.b", not "540.4.b.C…".
export const RULE_REFERENCE_REGEX =
  /(?:\b(?<keyword>[Rr]ules?|CR)\s+(?<dotted>\d+(?:\.\d+)*(?:\.[a-z](?:\.\d+)?)?)|\b(?<bare>\d{3}(?:\.\d+)+(?:\.[a-z](?:\.\d+)?)?))/gu;

const TITLE_WORD = "[A-Z][A-Za-z0-9-]*";
const HEADING_STOP_WORD = "(?:of|or|the|and|to|a|an)";
const TITLE_CASE_PHRASE = `${TITLE_WORD}(?:\\s+(?:${TITLE_WORD}|${HEADING_STOP_WORD}))*`;
const TERM_DEFINITION_REGEX = new RegExp(`^\\*(${TITLE_CASE_PHRASE})\\*\\.?$`, "u");
const HEADING_TEXT_REGEX = new RegExp(`^${TITLE_CASE_PHRASE}$`, "u");

function addTermAnchor(map: Map<string, string>, term: string, ruleNumber: string): void {
  const key = term.toLowerCase();
  map.set(key, ruleNumber);
  if (/[^aeiou]ies$/u.test(key)) {
    map.set(`${key.slice(0, -3)}y`, ruleNumber);
  } else if (/[^aeiou]y$/u.test(key)) {
    map.set(`${key.slice(0, -1)}ies`, ruleNumber);
  } else if (key.endsWith("s") && key.length > 2) {
    map.set(key.slice(0, -1), ruleNumber);
  } else if (key.length > 1) {
    map.set(`${key}s`, ruleNumber);
  }
}

export function buildTermAnchors(
  rules: readonly { ruleNumber: string; ruleType: string; depth: number; content: string }[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const rule of rules) {
    if (rule.ruleType !== "text" || rule.depth !== 0) {
      continue;
    }
    if (rule.content.includes("*")) {
      continue;
    }
    if (!HEADING_TEXT_REGEX.test(rule.content)) {
      continue;
    }
    for (const part of rule.content.split(/\s+and\s+/iu)) {
      const term = part.trim();
      if (term.length > 0 && /^[A-Z]/u.test(term)) {
        addTermAnchor(map, term, rule.ruleNumber);
      }
    }
  }
  for (const rule of rules) {
    if (rule.ruleType !== "text") {
      continue;
    }
    const match = rule.content.match(TERM_DEFINITION_REGEX);
    if (match) {
      addTermAnchor(map, match[1], rule.ruleNumber);
    }
  }
  for (const rule of rules) {
    if (rule.ruleType !== "subtitle") {
      continue;
    }
    for (const part of rule.content.split(/\s+and\s+/iu)) {
      const term = part.trim();
      if (term.length > 0 && /^[A-Z]/u.test(term)) {
        addTermAnchor(map, term, rule.ruleNumber);
      }
    }
  }
  return map;
}

/** Natural order: `100 < 100.1 < 100.1.a < 200 < 1000`. */
export function compareRuleNumbers(a: string, b: string): number {
  const partsA = a.split(".");
  const partsB = b.split(".");
  const len = Math.min(partsA.length, partsB.length);
  for (let i = 0; i < len; i++) {
    const partA = partsA[i];
    const partB = partsB[i];
    const numA = Number(partA);
    const numB = Number(partB);
    const aIsNum = !Number.isNaN(numA) && partA !== "";
    const bIsNum = !Number.isNaN(numB) && partB !== "";
    if (aIsNum && bIsNum) {
      if (numA !== numB) {
        return numA - numB;
      }
    } else if (aIsNum) {
      return -1;
    } else if (bIsNum) {
      return 1;
    } else {
      const cmp = partA.localeCompare(partB);
      if (cmp !== 0) {
        return cmp;
      }
    }
  }
  return partsA.length - partsB.length;
}
