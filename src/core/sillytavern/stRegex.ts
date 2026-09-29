// SillyTavern regex scripts (`extensions.regex_scripts`) as find/replace rules.
import type { ReplaceRule } from '../stores/settingsStore.ts'

interface StScript {
  scriptName?: string
  findRegex?: string
  replaceString?: string
  trimStrings?: string[]
  placement?: number[]
  disabled?: boolean
  markdownOnly?: boolean
  promptOnly?: boolean
}

// ST placements: 1 user input, 2 AI output. The others (slash commands, world info, reasoning)
// have no counterpart here.
const USER = 1
const AI = 2

export function rulesFromScripts(scripts: unknown): { rules: ReplaceRule[]; notes: string[] } {
  const rules: ReplaceRule[] = []
  const notes: string[] = []
  if (!Array.isArray(scripts)) return { rules, notes }
  let skipped = 0
  let trimmed = 0
  let html = 0
  for (const s of scripts as StScript[]) {
    const placement = s.placement ?? []
    const user = placement.includes(USER)
    const ai = placement.includes(AI)
    const source = typeof s.findRegex === 'string' ? s.findRegex : ''
    if (!source || (!user && !ai)) {
      skipped++
      continue
    }
    // `/pattern/flags`, or a bare pattern, which ST also reads as a regex.
    const slashed = /^\/([\s\S]*)\/([a-z]*)$/.exec(source)
    const replace = (s.replaceString ?? '').replaceAll('{{match}}', () => '$&')
    const convert = /<[a-z][^>]*>/i.test(replace)
    if (convert) html++
    if (s.trimStrings?.length) trimmed++
    rules.push({
      id: crypto.randomUUID(),
      name: s.scriptName?.trim() || undefined,
      find: slashed ? slashed[1] : source,
      replace,
      regex: true,
      flags: slashed ? slashed[2] : 'g',
      target: user && ai ? 'both' : user ? 'user' : 'assistant',
      // ST with neither flag edits the stored message. Here it applies to screen and prompt, and
      // the stored text stays as the model wrote it.
      applies: s.promptOnly && !s.markdownOnly ? 'prompt' : s.markdownOnly && !s.promptOnly ? 'display' : 'both',
      enabled: !s.disabled && !convert,
      ...(convert ? { convert: true } : {}),
    })
  }
  if (skipped) notes.push(`${skipped} regex scripts skipped: they run somewhere other than messages.`)
  if (html) notes.push(`${html} regex scripts output HTML and were imported switched off. Convert them in Palette, Text rules.`)
  if (trimmed) notes.push(`${trimmed} regex scripts use "Trim out", which isn't supported. They import without it.`)
  return { rules, notes }
}
