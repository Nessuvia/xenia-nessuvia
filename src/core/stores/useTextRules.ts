// A chat's text rules, resolved from the three places sets live: Global in `appearance`, a stack's
// own on the stack, the user's in `settings.ruleSets`.
import { useMemo } from 'react'
import type { Chat, PromptStack, Story, TextRules } from '../storage/types'
import { allSets, chatSetIds, globalSetId, mergeSets, stackSetId, storySetIds, type NamedSet } from '../prompt/textRules'
import { useAppearance, useSettings, type ReplaceRule } from './settingsStore'
import { useStacks } from './stacksStore'
import { useChats } from './chatStore'

function chatStack(chat: Chat | null | undefined, stacks: PromptStack[], activeId: number | null) {
  const id = chat?.stackId ?? activeId
  return stacks.find((s) => s.id === id)
}

/** Sync read for the send path. The caller has loaded stacks already (stackFor does). */
export function textRulesFor(chat: Chat | null | undefined): TextRules {
  const settings = useSettings.getState()
  const stacks = useStacks.getState().stacks
  const sets = allSets(settings.appearance, stacks, settings.ruleSets ?? [])
  return mergeSets(chatSetIds(chat, chatStack(chat, stacks, settings.activeStackId)), sets)
}

/** A Story's Find & Replace rules, sync, for the send path. Tag rules don't reach a document. */
export function storyReplaceRules(story: Story | null | undefined): ReplaceRule[] {
  const settings = useSettings.getState()
  const stacks = useStacks.getState().stacks
  const stack = stacks.find((s) => s.id === settings.activeStoryStackId)
  return mergeSets(storySetIds(story, stack), allSets(settings.appearance, stacks, settings.ruleSets ?? [])).replaceRules
}

/** The open Story's set ids, defaults included, and its merged Find & Replace rules. */
export function useStoryRules(story: Story | null | undefined): { ids: string[]; replaceRules: ReplaceRule[] } {
  const sets = useAllSets()
  const activeId = useSettings((s) => s.activeStoryStackId)
  const stack = useStacks((s) => s.stacks.find((x) => x.id === activeId))
  const ids = storySetIds(story, stack)
  const key = ids.join('\n')
  const replaceRules = useMemo(() => mergeSets(ids, sets).replaceRules, [key, sets])
  return { ids, replaceRules }
}

/** Every pickable set, for the chat panel and the editor. */
export function useAllSets(): NamedSet[] {
  const appearance = useAppearance()
  const stacks = useStacks((s) => s.stacks)
  const ruleSets = useSettings((s) => s.ruleSets)
  return useMemo(() => allSets(appearance, stacks, ruleSets ?? []), [appearance.tagRules, appearance.replaceRules, stacks, ruleSets])
}

/** The open chat's set ids, defaults included. */
export function useChatSetIds(): string[] {
  const chat = useChats((s) => s.chat)
  const stacks = useStacks((s) => s.stacks)
  const activeId = useSettings((s) => s.activeStackId)
  return chatSetIds(chat, chatStack(chat, stacks, activeId))
}

/** The open chat's merged rules. Outside a chat that's Global alone. */
export function useChatTextRules(): TextRules {
  const sets = useAllSets()
  const ids = useChatSetIds()
  return useMemo(() => mergeSets(ids, sets), [ids.join('\n'), sets])
}

/** Write a set wherever it lives. A stack's set is edited in place: every chat using it follows. */
export function saveSet(id: string, patch: Partial<TextRules>): void {
  if (id === globalSetId) return useSettings.getState().setAppearance(patch)
  if (id.startsWith('stack:')) {
    const stack = useStacks.getState().stacks.find((s) => stackSetId(s.id!) === id)
    if (stack) void useStacks.getState().save({ ...stack, textRules: { tagRules: [], replaceRules: [], ...stack.textRules, ...patch } })
    return
  }
  const { ruleSets, setRuleSets } = useSettings.getState()
  setRuleSets(ruleSets.map((s) => (s.id === id ? { ...s, ...patch } : s)))
}

export function createSet(name: string): string {
  const id = crypto.randomUUID()
  const { ruleSets, setRuleSets } = useSettings.getState()
  setRuleSets([...ruleSets, { id, name, tagRules: [], replaceRules: [] }])
  return id
}
