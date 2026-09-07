export interface ReorderMoves {
  moveTo: (fromKey: string, toKey: string) => string[] | null;
  step: (fromKey: string, direction: -1 | 1) => string[] | null;
  canDropOn: (fromKey: string, toKey: string) => boolean;
  canStep: (fromKey: string, direction: -1 | 1) => boolean;
  block: (fromKey: string) => string[];
}

interface ReorderNode {
  key: string;
  parentKey: string | null;
}

/**
 * `nodes` must be in display order, which for a tree means depth-first (a
 * parent immediately followed by its subtree), so a subtree is a contiguous
 * block a move can splice in one piece.
 */
function buildReorderMoves(nodes: ReorderNode[]): ReorderMoves {
  const keys = nodes.map((node) => node.key);
  const parentByKey = new Map(nodes.map((node) => [node.key, node.parentKey]));
  const positionByKey = new Map(keys.map((key, index) => [key, index]));
  const childrenByParent = new Map<string | null, string[]>();
  for (const node of nodes) {
    const siblings = childrenByParent.get(node.parentKey);
    if (siblings) {
      siblings.push(node.key);
    } else {
      childrenByParent.set(node.parentKey, [node.key]);
    }
  }

  function parentOf(key: string): string | null {
    return parentByKey.get(key) ?? null;
  }

  function block(fromKey: string): string[] {
    if (!positionByKey.has(fromKey)) {
      return [];
    }
    const seen = new Set([fromKey]);
    const queue = [fromKey];
    while (queue.length > 0) {
      const current = queue.pop();
      if (current === undefined) {
        break;
      }
      for (const child of childrenByParent.get(current) ?? []) {
        if (!seen.has(child)) {
          seen.add(child);
          queue.push(child);
        }
      }
    }
    return keys.filter((key) => seen.has(key));
  }

  function siblingAncestor(ofKey: string, parentKey: string | null): string | null {
    const guard = new Set<string>();
    let current: string | null = ofKey;
    while (current !== null && !guard.has(current)) {
      guard.add(current);
      if (!positionByKey.has(current)) {
        return null;
      }
      if (parentOf(current) === parentKey) {
        return current;
      }
      current = parentOf(current);
    }
    return null;
  }

  function spliceBlock(fromKey: string, targetKey: string, after: boolean): string[] {
    const moving = block(fromKey);
    const movingKeys = new Set(moving);
    const rest = keys.filter((key) => !movingKeys.has(key));
    const targetBlock = block(targetKey);
    const anchor = after ? (targetBlock.at(-1) ?? targetKey) : targetKey;
    const at = rest.indexOf(anchor) + (after ? 1 : 0);
    return [...rest.slice(0, at), ...moving, ...rest.slice(at)];
  }

  function dropTarget(fromKey: string, toKey: string): string | null {
    if (fromKey === toKey || !positionByKey.has(fromKey) || !positionByKey.has(toKey)) {
      return null;
    }
    const target = siblingAncestor(toKey, parentOf(fromKey));
    if (target === fromKey) {
      return null;
    }
    return target;
  }

  function stepTarget(fromKey: string, direction: -1 | 1): string | null {
    const siblings = childrenByParent.get(parentOf(fromKey)) ?? [];
    const at = siblings.indexOf(fromKey);
    if (at === -1) {
      return null;
    }
    return siblings[at + direction] ?? null;
  }

  return {
    block,
    canDropOn: (fromKey, toKey) => dropTarget(fromKey, toKey) !== null,
    canStep: (fromKey, direction) => stepTarget(fromKey, direction) !== null,
    moveTo(fromKey, toKey) {
      const target = dropTarget(fromKey, toKey);
      if (target === null) {
        return null;
      }
      const targetPosition = positionByKey.get(target) ?? 0;
      const fromPosition = positionByKey.get(fromKey) ?? 0;
      return spliceBlock(fromKey, target, targetPosition > fromPosition);
    },
    step(fromKey, direction) {
      const target = stepTarget(fromKey, direction);
      if (target === null) {
        return null;
      }
      return spliceBlock(fromKey, target, direction === 1);
    },
  };
}

export function flatReorder<T>(items: readonly T[], getKey: (item: T) => string): ReorderMoves {
  return buildReorderMoves(items.map((item) => ({ key: getKey(item), parentKey: null })));
}

export function treeReorder<T>(
  items: readonly T[],
  getKey: (item: T) => string,
  getParentKey: (item: T) => string | null,
): ReorderMoves {
  return buildReorderMoves(
    items.map((item) => ({ key: getKey(item), parentKey: getParentKey(item) })),
  );
}
