// A prompt stack is one template. This file reads the parts of it that aren't plain `{% if %}`:
// variable declarations, message roles, depth injection and the history slot. `template.ts` still
// resolves conditions and `{{variables}}`; the builders call both.
//
//   {% var affection slider 0 100 5 = 50 label="Affection" %}
//   {% var banned list = "ozone|breath hitching" sep="; " %}
//   Text outside any tag is a system message.
//   {{ history }}
//   {% depth 2 %}[Note: {{ authorNote }}]{% enddepth %}
//   {% message user %}Continue.{% endmessage %}
//
// Extension-ful imports on purpose: checkStackTemplate.ts runs this under
// `node --experimental-strip-types`.
import type { PromptStack, StackValue, StackVariable } from '../storage/types'
import { stripComments } from './stripComments.ts'

export type Role = 'system' | 'user' | 'assistant'

/** A run of text with one role and placement, or the place chat history goes. */
export type StackPart = { kind: 'text'; role: Role; depth?: number; text: string } | { kind: 'history' }

export interface TemplateProblem {
  /** 1-based. */
  line: number
  message: string
}

// A declaration may hold a bare `%` ("34% smaller" in an info string): only `%}` ends it.
const varTag = /\{%\s*var\b((?:[^%]|%(?!\}))*)%\}/gi
const varLine = /^[ \t]*\{%\s*var\b(?:[^%]|%(?!\}))*%\}[ \t]*\r?\n?/gim
// The structural tags plus the history slot. `%` is kept out of the argument, as in template.ts.
const structTag = /\{%\s*(message|endmessage|depth|enddepth)\b\s*([^%]*?)\s*%\}|\{\{\s*history\s*\}\}/gi

const kindNames: Record<string, StackVariable['kind']> = {
  slider: 'sliderSingle',
  range: 'sliderRange',
  dropdown: 'dropdown',
  checkbox: 'checkbox',
  text: 'text',
  dice: 'dice',
  list: 'list',
  length: 'length',
}

const lineAt = (text: string, index: number) => text.slice(0, index).split('\n').length

const unquote = (s: string) => s.trim().replace(/^"([\s\S]*)"$/, '$1')

/** One `{% var %}` body to a variable, or the reason it isn't one. */
function parseVar(body: string): StackVariable | string {
  let rest = body
  const attr = (name: string) => {
    const m = new RegExp(`\\b${name}="([^"]*)"`).exec(rest)
    if (!m) return undefined
    rest = rest.replace(m[0], '')
    return m[1]
  }
  const label = attr('label')
  const info = attr('info')
  const sep = attr('sep')
  const eq = rest.indexOf('=')
  const head = (eq < 0 ? rest : rest.slice(0, eq)).trim().split(/\s+/).filter(Boolean)
  const def = eq < 0 ? undefined : rest.slice(eq + 1).trim()
  const [id, kindName, ...args] = head
  if (!id || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(id)) return 'A variable needs a name made of letters, digits and _.'
  const kind = kindNames[kindName?.toLowerCase() ?? '']
  if (!kind) return `Unknown kind "${kindName ?? ''}". Use slider, range, dropdown, checkbox, text, list, dice or length.`
  const base = { id, label: label ?? id, ...(info ? { info } : {}) }
  const nums = args.map(Number)
  if (kind === 'sliderSingle' || kind === 'sliderRange') {
    const [min = 0, max = 100, step = 1] = nums
    if (nums.some(Number.isNaN)) return 'Slider bounds must be numbers: min max step.'
    if (kind === 'sliderSingle') {
      const value = def === undefined ? min : Number(def)
      if (Number.isNaN(value)) return 'The default must be a number.'
      return { ...base, kind, min, max, step, value }
    }
    const pair = def === undefined ? [min, max] : def.split(/\s+/).map(Number)
    if (pair.length !== 2 || pair.some(Number.isNaN)) return 'A range default is two numbers: = 10 40.'
    return { ...base, kind, min, max, step, value: [pair[0], pair[1]] }
  }
  if (kind === 'dropdown') {
    const options = args.join(' ').split('|').map((o) => o.trim()).filter(Boolean)
    if (!options.length) return 'A dropdown needs options: dropdown calm|angry.'
    const value = def === undefined ? options[0] : unquote(def)
    if (!options.includes(value)) return `"${value}" isn't one of the options.`
    return { ...base, kind, options, value }
  }
  if (kind === 'checkbox') {
    if (def !== undefined && def !== 'true' && def !== 'false') return 'A checkbox default is true or false.'
    return { ...base, kind, value: def === 'true' }
  }
  if (kind === 'list') {
    // `= a|b` for the starting items. `sep="\n"` for one per line; the default is a comma and a space.
    const value = def === undefined ? '' : unquote(def).split('|').map((s) => s.trim()).filter(Boolean).join('\n')
    return { ...base, kind, sep: sep === undefined ? ', ' : sep.replace(/\\n/g, '\n').replace(/\\t/g, '\t'), value }
  }
  if (kind === 'length') {
    // `length 50|150|400 words = 150`: short, medium and long, then the unit.
    const [presetText = '', unit = 'words'] = args
    const presets = presetText.split('|').map(Number)
    if (presets.length !== 3 || presets.some((n) => Number.isNaN(n) || n <= 0))
      return 'A length needs three presets and a unit: length 50|150|400 words.'
    const value = def === undefined ? presets[1] : Number(def)
    if (Number.isNaN(value)) return 'The default must be a number.'
    return { ...base, kind, presets: presets as [number, number, number], unit, value }
  }
  if (kind === 'text') return { ...base, kind, value: def === undefined ? '' : unquote(def) }
  return { ...base, kind, value: def === undefined ? '1d20' : unquote(def) }
}

/** The declared variables, in order, and a problem for each declaration that didn't parse. */
export function templateVariables(template: string): { variables: StackVariable[]; problems: TemplateProblem[] } {
  const text = stripComments(template)
  const variables: StackVariable[] = []
  const problems: TemplateProblem[] = []
  for (const m of text.matchAll(varTag)) {
    const found = parseVar(m[1])
    const line = lineAt(text, m.index)
    if (typeof found === 'string') problems.push({ line, message: found })
    else if (variables.some((v) => v.id.toLowerCase() === found.id.toLowerCase()))
      problems.push({ line, message: `${found.id} is declared twice.` })
    else variables.push(found)
  }
  return { variables, problems }
}

/** Whether a stored value fits the declaration. A value left over from an older declaration is dropped. */
function fits(v: StackVariable, value: StackValue): boolean {
  if (v.kind === 'sliderRange') return Array.isArray(value) && value.length === 2
  if (v.kind === 'sliderSingle' || v.kind === 'length') return typeof value === 'number'
  if (v.kind === 'checkbox') return typeof value === 'boolean'
  if (v.kind === 'dropdown') return typeof value === 'string' && v.options.includes(value)
  return typeof value === 'string'
}

/** The stack's variables with the player's current values over the template's defaults. */
export function stackVariables(stack: Pick<PromptStack, 'template' | 'values'>): StackVariable[] {
  return templateVariables(stack.template).variables.map((v) => {
    const value = stack.values?.[v.id]
    return value !== undefined && fits(v, value) ? ({ ...v, value } as StackVariable) : v
  })
}

/** A player's change to one variable, written to the stack's values. */
export function withValue(stack: PromptStack, v: StackVariable): PromptStack {
  return { ...stack, values: { ...stack.values, [v.id]: v.value } }
}

/** The template with its declarations removed. Comments go too: a tag inside one is never read. */
export const templateBody = (template: string) => stripComments(template).replace(varLine, '').replace(varTag, '')

/**
 * Resolved text to parts. Forgiving, like `resolveTemplate`: a stray closer is dropped and an
 * unclosed tag runs to the end. `templateProblems` is where the editor hears about those.
 */
export function stackParts(text: string): StackPart[] {
  const parts: StackPart[] = []
  const roles: Role[] = []
  const depths: number[] = []
  let last = 0
  const flush = (end: number) => {
    const chunk = text.slice(last, end).replace(/\n(?:[ \t]*\n){2,}/g, '\n\n').trim()
    if (chunk) parts.push({ kind: 'text', role: roles.at(-1) ?? 'system', depth: depths.at(-1), text: chunk })
  }
  for (const m of text.matchAll(structTag)) {
    flush(m.index)
    last = m.index + m[0].length
    const tag = m[1]?.toLowerCase()
    if (!tag) parts.push({ kind: 'history' })
    else if (tag === 'message') roles.push(role(m[2]) ?? 'system')
    else if (tag === 'endmessage') roles.pop()
    else if (tag === 'depth') depths.push(depthOf(m[2]) ?? 0)
    else depths.pop()
  }
  flush(text.length)
  return parts
}

const role = (arg: string): Role | undefined => {
  const r = arg.trim().toLowerCase()
  return r === 'system' || r === 'user' || r === 'assistant' ? r : undefined
}
const depthOf = (arg: string): number | undefined => (/^\d+$/.test(arg.trim()) ? Number(arg.trim()) : undefined)

/** Whether the template uses a slot anywhere, as `{{ name }}` or as a `{% name %}` fallback block. */
export const usesSlot = (template: string, name: string) =>
  new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}|\\{%\\s*${name}\\s*%\\}`, 'i').test(stripComments(template))

/**
 * Everything wrong with a template, with lines, for the editor. Read from the raw text: a tag in an
 * `{% if %}` branch counts whether or not the branch is taken.
 */
export function templateProblems(template: string, kind: 'chat' | 'story'): TemplateProblem[] {
  const problems = [...templateVariables(template).problems]
  const text = stripComments(template)
  const open: { tag: string; line: number }[] = []
  let history = 0
  for (const m of text.matchAll(structTag)) {
    const line = lineAt(text, m.index)
    const tag = m[1]?.toLowerCase()
    if (!tag) {
      history++
      if (kind === 'story') problems.push({ line, message: 'Story stacks have no chat history.' })
      else if (open.length) problems.push({ line, message: 'History can\'t sit inside a message or depth tag.' })
      continue
    }
    if (tag === 'message' || tag === 'depth') {
      if (tag === 'message' && !role(m[2])) problems.push({ line, message: 'A message is user, assistant or system.' })
      if (tag === 'depth' && depthOf(m[2]) === undefined) problems.push({ line, message: 'A depth is a whole number.' })
      if (tag === 'depth' && kind === 'story') problems.push({ line, message: 'Story stacks have no history to inject into.' })
      if (open.some((o) => o.tag === tag)) problems.push({ line, message: `A ${tag} tag is already open.` })
      open.push({ tag, line })
      continue
    }
    const want = tag.slice(3)
    if (open.at(-1)?.tag === want) open.pop()
    else problems.push({ line, message: `{% ${tag} %} has nothing to close.` })
  }
  for (const o of open) problems.push({ line: o.line, message: `{% ${o.tag} %} is never closed.` })
  if (kind === 'chat' && history === 0) problems.push({ line: 1, message: 'Add {{ history }} where the chat goes.' })
  if (history > 1) problems.push({ line: 1, message: 'Only one {{ history }} allowed.' })
  if (kind === 'story' && !usesSlot(template, 'before'))
    problems.push({ line: 1, message: 'Add {{ before }} where the document goes.' })
  return problems.sort((a, b) => a.line - b.line)
}
