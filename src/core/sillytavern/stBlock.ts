// The importer's working list. ST presets are ordered lists of prompts, so the passes work on a list
// of pieces and `stTemplate` writes the finished list out as one stack template.
import type { StackVariable } from '../storage/types.ts'

/** What a piece pulls in. `text` is the piece's own content; the rest are template slots. */
export type StSource =
  | 'text'
  | 'charDescription'
  | 'charPersonality'
  | 'charScenario'
  | 'charExampleDialogue'
  | 'personaDescription'
  | 'worldInfo'
  | 'worldInfoAfter'
  | 'postHistory'
  | 'history'

export interface StPiece {
  label: string
  source: StSource
  role: 'system' | 'user' | 'assistant'
  content: string
  info?: string
  depth?: number
  /** A variable id: the piece is wrapped in `{% if when %}`. */
  when?: string
  disabled?: boolean
}

export function stBlock(partial: Partial<StPiece> = {}): StPiece {
  const source = partial.source ?? 'text'
  return { label: source, source, role: 'system', content: '', ...partial }
}

// A comment body can't hold its own closer.
const safe = (text: string) => text.replace(/#\}/g, '# }')
const attr = (text: string) => text.replace(/"/g, "'")

function declaration(v: StackVariable): string {
  const label = v.label !== v.id ? ` label="${attr(v.label)}"` : ''
  const info = v.info ? ` info="${attr(v.info.replace(/\s+/g, ' '))}"` : ''
  if (v.kind === 'checkbox') return `{% var ${v.id} checkbox = ${v.value}${label}${info} %}`
  if (v.kind === 'text') return `{% var ${v.id} text = "${attr(v.value)}"${label}${info} %}`
  if (v.kind === 'list') return `{% var ${v.id} list = "${attr(v.value.split('\n').join('|'))}" sep="${attr(v.sep.replace(/\n/g, '\\n'))}"${label}${info} %}`
  if (v.kind === 'dice') return `{% var ${v.id} dice = ${v.value}${label}${info} %}`
  if (v.kind === 'dropdown') return `{% var ${v.id} dropdown ${v.options.join('|')} = ${v.value}${label}${info} %}`
  if (v.kind === 'length') return `{% var ${v.id} length ${v.presets.join('|')} ${v.unit} = ${v.value}${label}${info} %}`
  if (v.kind === 'sliderSingle') return `{% var ${v.id} slider ${v.min} ${v.max} ${v.step} = ${v.value}${label}${info} %}`
  return `{% var ${v.id} range ${v.min} ${v.max} ${v.step} = ${v.value[0]} ${v.value[1]}${label}${info} %}`
}

function piece(p: StPiece): string {
  let body =
    p.source === 'text'
      ? p.content
      : p.source === 'postHistory' && p.content.trim()
        ? `{% postHistory %}\n${p.content}\n{% endpostHistory %}`
        : `{{ ${p.source} }}`
  if (p.role !== 'system') body = `{% message ${p.role} %}\n${body}\n{% endmessage %}`
  if (p.depth !== undefined) body = `{% depth ${p.depth} %}\n${body}\n{% enddepth %}`
  if (p.when) body = `{% if ${p.when} %}\n${body}\n{% endif %}`
  // The label rides as a comment: the template reads like the prompt list it came from.
  const note = p.source === 'text' ? [p.label, p.info].filter(Boolean).join(': ') : ''
  return note ? `{# ${safe(note)} #}\n${body}` : body
}

/** The list as one template: declarations first, then each piece, a blank line apart. A piece the
 *  preset had switched off, with no variable to switch it back, is left out. */
export function stTemplate(pieces: StPiece[], variables: StackVariable[]): string {
  const decls = variables.map(declaration)
  const body = pieces.filter((p) => !p.disabled).map(piece)
  return [...(decls.length ? [decls.join('\n')] : []), ...body].join('\n\n')
}
