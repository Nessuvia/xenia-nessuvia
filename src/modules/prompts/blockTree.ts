// Pure tree ops for the stack editor. Every function returns new arrays: the draft is replaced,
// never mutated. React sees the change and undo stays possible later.
import type { PromptBlock } from '../../core/storage/types'

/** A block plus where it sits, so the editor can render a flat list of indented rows. */
export interface Row {
  block: PromptBlock
  depth: number
  parentId: string | null
}

export function flatten(list: PromptBlock[], depth = 0, parentId: string | null = null): Row[] {
  return list.flatMap((block) => [
    { block, depth, parentId },
    ...flatten(block.children ?? [], depth + 1, block.id),
  ])
}

export function findBlock(list: PromptBlock[], id: string): PromptBlock | undefined {
  for (const block of list) {
    if (block.id === id) return block
    const found = findBlock(block.children ?? [], id)
    if (found) return found
  }
  return undefined
}

/** True when `id` is the block itself or anywhere below it: a block can't be dropped into itself. */
export function contains(block: PromptBlock, id: string): boolean {
  return block.id === id || (block.children ?? []).some((child) => contains(child, id))
}

export function allBlocks(list: PromptBlock[]): PromptBlock[] {
  return flatten(list).map((row) => row.block)
}

export function removeBlock(list: PromptBlock[], id: string): PromptBlock[] {
  return list
    .filter((block) => block.id !== id)
    .map((block) =>
      block.children ? unparent({ ...block, children: removeBlock(block.children, id) }) : block,
    )
}

/** A block that lost its last child is a plain block again. Its closing text goes with it. */
function unparent(block: PromptBlock): PromptBlock {
  if (block.children && block.children.length > 0) return block
  const { children: _children, closeContent: _closeContent, ...rest } = block
  return rest
}

/** Insert into `parentId`'s children (or the root list when null), before `beforeId` or at the end. */
export function insertBlock(
  list: PromptBlock[],
  block: PromptBlock,
  parentId: string | null,
  beforeId: string | null,
): PromptBlock[] {
  if (parentId === null) return spliceBefore(list, block, beforeId)
  return list.map((candidate) =>
    candidate.id === parentId
      ? { ...candidate, children: spliceBefore(candidate.children ?? [], block, beforeId) }
      : candidate.children
        ? { ...candidate, children: insertBlock(candidate.children, block, parentId, beforeId) }
        : candidate,
  )
}

function spliceBefore(list: PromptBlock[], block: PromptBlock, beforeId: string | null) {
  const at = beforeId ? list.findIndex((b) => b.id === beforeId) : -1
  if (at === -1) return [...list, block]
  return [...list.slice(0, at), block, ...list.slice(at)]
}

export function replaceBlock(list: PromptBlock[], block: PromptBlock): PromptBlock[] {
  return list.map((candidate) =>
    candidate.id === block.id
      ? block
      : candidate.children
        ? { ...candidate, children: replaceBlock(candidate.children, block) }
        : candidate,
  )
}

/** The list that directly holds `id`, and that list's parent id (null at the root). */
export function siblingsOf(
  list: PromptBlock[],
  id: string,
  parentId: string | null = null,
): { siblings: PromptBlock[]; parentId: string | null } | null {
  if (list.some((block) => block.id === id)) return { siblings: list, parentId }
  for (const block of list) {
    const found = block.children && siblingsOf(block.children, id, block.id)
    if (found) return found
  }
  return null
}

export type MoveDir = 'up' | 'down' | 'left' | 'right'

/**
 * Keyboard move of one block: up/down reorder within its sibling list, right nests into the block
 * directly above, left pops out to sit just after its parent. Returns a new list, or null for a
 * no-op: the edge of its sibling list, already top level, or a nest Chat History can't take part in.
 */
export function moveByKey(list: PromptBlock[], id: string, dir: MoveDir): PromptBlock[] | null {
  const loc = siblingsOf(list, id)
  if (!loc) return null
  const { siblings, parentId } = loc
  const i = siblings.findIndex((block) => block.id === id)
  const block = siblings[i]

  if (dir === 'up' || dir === 'down') {
    const j = dir === 'up' ? i - 1 : i + 1
    if (j < 0 || j >= siblings.length) return null
    const beforeId = dir === 'up' ? siblings[j].id : (siblings[j + 1]?.id ?? null)
    return insertBlock(removeBlock(list, id), block, parentId, beforeId)
  }

  if (dir === 'right') {
    const target = siblings[i - 1]
    // Chat History can neither move inside a block nor hold one. It's out of both roles here.
    if (!target || block.source === 'chatHistory' || target.source === 'chatHistory') return null
    return addChild(removeBlock(list, id), target.id, block)
  }

  // left: already top level has nowhere to go.
  if (parentId === null) return null
  const pruned = removeBlock(list, id)
  const grand = siblingsOf(pruned, parentId)
  const gpSiblings = grand ? grand.siblings : pruned
  const gpId = grand ? grand.parentId : null
  const at = gpSiblings.findIndex((block) => block.id === parentId)
  return insertBlock(pruned, block, gpId, gpSiblings[at + 1]?.id ?? null)
}

/** Turns a block into a container if it isn't one, and appends `child`. */
export function addChild(list: PromptBlock[], parentId: string, child: PromptBlock): PromptBlock[] {
  return list.map((candidate) =>
    candidate.id === parentId
      ? { ...candidate, children: [...(candidate.children ?? []), child] }
      : candidate.children
        ? { ...candidate, children: addChild(candidate.children, parentId, child) }
        : candidate,
  )
}
