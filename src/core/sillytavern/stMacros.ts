// SillyTavern macros rewritten into stack features at import, so the stack reads like one written
// here rather than a transcript of ST's runtime.
//
// Comments: a block's leading `{{// }}` notes become its tooltip (`info`); later ones become
// `{# #}`. `{{trim}}` goes.
//
// Toggles: every ST prompt can be switched on and off. Here each text block gets a checkbox
// variable and a `when` naming it, the one switch players see.
//
// Variables: ST presets wire toggles together with setvar/getvar. A prompt that switches on runs
// `{{setvar::x::text}}`, and another prompt pastes it with `{{getvar::x}}`, empty when the setter
// is off. Each getvar becomes `{% if id %}text{% endif %}` on the setter's checkbox. A setvar with
// an empty value is ST resetting the name before the setters run, and just goes.
// ponytail: order-blind. A getvar above its setter in ST's order reads empty there and the
// setter's text here. No preset seen relies on that; honour it if one does.
import type { PromptBlock, StackVariable } from '../storage/types.ts'

interface Macro {
  start: number
  end: number
  body: string
}

/** `{{prefix...}}` occurrences, braces balanced: a value may hold `{{user}}` or another getvar. */
export function findMacros(text: string, prefix: string): Macro[] {
  const out: Macro[] = []
  let i = 0
  while ((i = text.indexOf('{{' + prefix, i)) !== -1) {
    let depth = 0
    let j = i
    for (; j < text.length; j++) {
      if (text.startsWith('{{', j)) {
        depth++
        j++
      } else if (text.startsWith('}}', j)) {
        depth--
        j++
        if (!depth) break
      }
    }
    if (depth) break // unclosed: leave the rest alone
    out.push({ start: i, end: j + 1, body: text.slice(i + 2 + prefix.length, j - 1) })
    i = j + 1
  }
  return out
}

const cut = (text: string, list: Macro[], replace: (m: Macro) => string) => {
  for (const m of [...list].reverse()) text = text.slice(0, m.start) + replace(m) + text.slice(m.end)
  return text
}

const tidy = (text: string) =>
  text
    .replace(/\{\{trim\}\}/gi, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .trimEnd()

/**
 * A block's comments. Those before any real text are the author explaining the toggle: they
 * become `info`. The rest become `{# #}`, unless one holds `#}`, which stays in ST form.
 */
export function convertComments(content: string): { content: string; info?: string } {
  const comments = findMacros(content, '//')
  const notes: string[] = []
  let leadEnd = 0
  for (const m of comments) {
    if (content.slice(leadEnd, m.start).replace(/\{\{trim\}\}/gi, '').trim()) break
    notes.push(m.body.trim())
    leadEnd = m.end
  }
  const rest = comments.slice(notes.length)
  const body = content.slice(leadEnd)
  const shift = (m: Macro) => ({ ...m, start: m.start - leadEnd, end: m.end - leadEnd })
  const converted = cut(body, rest.map(shift), (m) =>
    m.body.includes('#}') ? `{{//${m.body}}}` : `{# ${m.body.trim()} #}`,
  )
  const info = notes.filter(Boolean).join('\n\n')
  return { content: tidy(converted), ...(info ? { info } : {}) }
}

/** A camelCase variable id from a block label: letters and digits only, never empty. */
function idFrom(label: string, taken: Set<string>) {
  // Apostrophes join rather than split (GM's -> gms), and three words is plenty for an id.
  const words = label
    .normalize('NFKD')
    .replace(/['’]/g, '')
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
  let base =
    words.map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase())).join('') || 'toggle'
  if (/^\d/.test(base)) base = 'v' + base
  let id = base
  for (let n = 2; taken.has(id.toLowerCase()); n++) id = base + n
  taken.add(id.toLowerCase())
  return id
}

export interface MacrosImport {
  blocks: PromptBlock[]
  variables: StackVariable[]
  notes: string[]
}

/** A checkbox per text block, then the setvar/getvar pass. Bound blocks pass through. */
export function convertVariables(blocks: PromptBlock[]): MacrosImport {
  const taken = new Set<string>()
  const variables: StackVariable[] = []
  // name -> setters in stack order, each [variable id, value]
  const setters = new Map<string, [string, string][]>()

  const pass1 = blocks.map((b) => {
    if (b.source !== 'text') return b
    const id = idFrom(b.label, taken)
    variables.push({ id, label: b.label, kind: 'checkbox', value: !b.disabled, ...(b.info ? { info: b.info } : {}) })
    const sets = findMacros(b.content, 'setvar::')
    for (const m of sets) {
      const k = m.body.indexOf('::')
      const value = m.body.slice(k + 2)
      if (!value.trim()) continue
      const name = m.body.slice(0, k)
      setters.set(name, [...(setters.get(name) ?? []), [id, value]])
    }
    // The checkbox is the switch now. `disabled` is the maker's own switch, and starts off.
    const { disabled: _d, ...rest } = b
    return { ...rest, when: id, content: sets.length ? tidy(cut(b.content, sets, () => '')) : b.content }
  })

  const unresolved = new Set<string>()
  const out = pass1.map((b) => {
    const gets = findMacros(b.content, 'getvar::')
    if (!gets.length) return b
    let text = b.content
    for (const m of [...gets].reverse()) {
      const found = setters.get(m.body)
      if (!found) {
        unresolved.add(`{{getvar::${m.body}}}`)
        continue
      }
      // A later setter overwrites an earlier one in ST, so it's asked first.
      const chain = [...found].reverse()
      const lineStart = text.lastIndexOf('\n', m.start - 1) + 1
      const nl = text.indexOf('\n', m.end)
      const lineEnd = nl === -1 ? text.length : nl
      const indent = text.slice(lineStart, m.start)
      const ownLine = !indent.trim() && !text.slice(m.end, lineEnd).trim()
      // Inline tags close on their own line, so a multi-line value always takes the block form.
      if (ownLine || chain.some(([, v]) => v.includes('\n'))) {
        const arms = chain.map(([id, v], i) => `{% ${i ? 'elif' : 'if'} ${id} %}\n${ownLine ? indent : ''}${v}`)
        const tag = `${arms.join('\n')}\n{% endif %}`
        text = ownLine
          ? text.slice(0, lineStart) + tag + text.slice(lineEnd)
          : text.slice(0, m.start) + `\n${tag}\n` + text.slice(m.end)
      } else {
        const arms = chain.map(([id, v], i) => `{% ${i ? 'elif' : 'if'} ${id} %}${v}`)
        text = text.slice(0, m.start) + `${arms.join('')}{% endif %}` + text.slice(m.end)
      }
    }
    return { ...b, content: text }
  })

  const notes: string[] = []
  if (variables.length) {
    notes.push(`${variables.length} prompts became checkbox variables.`)
  }
  if (unresolved.size) {
    notes.push(`Nothing in the preset sets these, left as written: ${[...unresolved].join(', ')}.`)
  }
  return { blocks: out, variables, notes }
}

// Macros the stack resolves itself, or that the passes above consume.
const known = new Set(['roll', 'setvar', 'getvar', 'trim'])

/** ST function macros (`{{name::...}}`) nothing here maps, for the import summary. */
export function unmappedMacros(blocks: PromptBlock[]): string[] {
  const names = new Set<string>()
  for (const b of blocks) {
    for (const m of b.content.matchAll(/\{\{\s*([A-Za-z_]+)(?:::|\s)/g)) {
      if (!known.has(m[1].toLowerCase())) names.add(m[1])
    }
  }
  return [...names]
}
