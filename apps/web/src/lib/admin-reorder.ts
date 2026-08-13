/**
 * Row-order math for the admin tables. Every reorder mutation takes the full key
 * list in the new order, so each move here returns that list rather than a
 * patch. Pages build one of these with {@link flatReorder} or
 * {@link treeReorder} and hand it to `AdminTable`'s `reorder.moves`.
 */
export interface ReorderMoves {
  /**
   * Drops `fromKey` into `toKey`'s slot. In a tree, `toKey` resolves to whichever
   * of its ancestors is a sibling of `fromKey`, so a drop anywhere inside a
   * sibling's subtree lands next to that sibling.
   *
   * @returns The full key list in the new order, or null when the move isn't allowed.
   */
  moveTo: (fromKey: string, toKey: string) => string[] | null;
  /**
   * Nudges `fromKey` one slot among its siblings.
   *
   * @returns The full key list in the new order, or null when it's already at that end.
   */
  step: (fromKey: string, direction: -1 | 1) => string[] | null;
  /**
   * Whether {@link moveTo} would do anything — cheap enough to ask once per row
   * on every render of a drag.
   *
   * @returns True when `fromKey` may be dropped on `toKey`.
   */
  canDropOn: (fromKey: string, toKey: string) => boolean;
  /**
   * Whether {@link step} would do anything, without building the key list.
   *
   * @returns True when `fromKey` has a sibling in that direction.
   */
  canStep: (fromKey: string, direction: -1 | 1) => boolean;
  /**
   * The rows that travel with `fromKey`: itself plus its descendants, in list
   * order. A flat list always returns just `fromKey`.
   *
   * @returns The moving block's keys.
   */
  block: (fromKey: string) => string[];
}

/** One row's place in the list, as the move math sees it. */
interface ReorderNode {
  key: string;
  /** The parent row's key, or null for a top-level row. */
  parentKey: string | null;
}

/**
 * Shared implementation. `nodes` must be in display order, which for a tree means
 * depth-first (a parent immediately followed by its subtree) — that's what makes
 * a subtree a contiguous block and lets a move splice it in one piece.
 *
 * @returns The move calculations over that order.
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
    // Breadth-first over the children map, then filtered back through `keys` so
    // the block comes out in display order. `seen` also keeps a malformed parent
    // chain (a cycle) from looping forever.
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

  /**
   * Walks up from `ofKey` to the ancestor (or `ofKey` itself) that sits directly
   * under `parentKey` — i.e. the sibling of the row being moved that owns this
   * drop target.
   *
   * @returns That sibling's key, or null when the target is in another branch.
   */
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

  /**
   * Lifts `fromKey`'s block out of the list and puts it back next to `targetKey`
   * (whose own block is stepped over when inserting after it).
   *
   * @returns The full key list in the new order.
   */
  function spliceBlock(fromKey: string, targetKey: string, after: boolean): string[] {
    const moving = block(fromKey);
    const movingKeys = new Set(moving);
    const rest = keys.filter((key) => !movingKeys.has(key));
    const targetBlock = block(targetKey);
    const anchor = after ? (targetBlock.at(-1) ?? targetKey) : targetKey;
    const at = rest.indexOf(anchor) + (after ? 1 : 0);
    return [...rest.slice(0, at), ...moving, ...rest.slice(at)];
  }

  /**
   * The sibling of `fromKey` that owns the `toKey` drop target.
   *
   * @returns That sibling's key, or null when the drop isn't a move.
   */
  function dropTarget(fromKey: string, toKey: string): string | null {
    if (fromKey === toKey || !positionByKey.has(fromKey) || !positionByKey.has(toKey)) {
      return null;
    }
    const target = siblingAncestor(toKey, parentOf(fromKey));
    // No sibling on the path means the target is in another branch, and a
    // target of `fromKey` itself means the drop landed inside its own subtree.
    if (target === fromKey) {
      return null;
    }
    return target;
  }

  /**
   * The sibling `fromKey` would trade places with.
   *
   * @returns That sibling's key, or null at either end of the sibling group.
   */
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

/**
 * Move calculations for a flat list, where every row can go anywhere.
 *
 * @returns The move calculations over `items`' current order.
 */
export function flatReorder<T>(items: readonly T[], getKey: (item: T) => string): ReorderMoves {
  return buildReorderMoves(items.map((item) => ({ key: getKey(item), parentKey: null })));
}

/**
 * Move calculations for a parent/child list rendered depth-first (the
 * distribution channels table). Rows only move among their own siblings, and a
 * row carries its children with it.
 *
 * @returns The move calculations over `items`' current order.
 */
export function treeReorder<T>(
  items: readonly T[],
  getKey: (item: T) => string,
  getParentKey: (item: T) => string | null,
): ReorderMoves {
  return buildReorderMoves(
    items.map((item) => ({ key: getKey(item), parentKey: getParentKey(item) })),
  );
}
