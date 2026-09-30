// Asking a model for a stack's look. Extension-ful imports on purpose: checkLookPrompt.ts runs this
// under `node --experimental-strip-types`.
//
// The model sees the variable declarations and nothing else from the stack: no template text, no
// misc prompts. It lays out controls and never needs to know what they switch on, and a request
// carrying a stack's prompt text reads to a hosted endpoint like a jailbreak being smuggled in.
import type { StackLook, StackVariable } from '../../core/storage/types.ts'
import type { ChatMessage } from '../../core/connectors/connectorInterface.ts'
import type { StructuredMode } from '../../core/palette/palettePrompt.ts'
import { firstJsonObject } from '../../core/palette/palettePrompt.ts'

export const lookPrompt = `You write the layout for a settings panel in Xenia Nessuvia, a browser app for character chat and story writing. The panel holds a prompt preset's variables: checkboxes, dropdowns, sliders and text fields. The app renders each control itself. Your HTML only decides where each one goes and what surrounds it.

Reply with one JSON object and nothing else. No prose, no code fence.

Fields:
- html: the layout. An element with data-var="id" gets that variable's control mounted inside it. Leave those elements empty.
- css: styles for the layout.
- hideUnplaced: true to hide every variable with no data-var element. false lists them after the layout.

HTML rules:
- Allowed tags: div, span, p, br, hr, img, h1, h2, h3, h4, section, ul, ol, li, b, i, strong, em, small, details, summary. Anything else rejects the whole layout.
- Allowed attributes: class, id, style, src, alt, data-var, data-group, data-none, and open on details. No event handlers, no links, no forms.
- Some presets spell one choice as several checkboxes (e.g. 1st, 2nd and 3rd person POV, or three sizes of the same feature). An element with data-group="id1, id2, id3" gets one dropdown that turns on exactly one of those checkboxes. Add data-none="Off" when turning all of them off is a valid choice. Only checkbox ids go in a group. Put a heading or label before the element: the dropdown has none.
- Use each variable id at most once, in either a data-var or a data-group. Only use ids from the list you are given.
- Headings and short labels are fine. Do not repeat a variable's own label next to its control: the control already shows it.

CSS rules:
- The CSS is scoped to the panel. :scope is the panel root. Do not target html, body or anything outside.
- The root carries each value as an attribute: data-<id in kebab case>="value", and -start and -end for ranges. Use them to show or hide parts, e.g. :scope[data-show-stats="false"] .statsGroup { display: none }.
- The mounted controls carry these classes: .optionalBlock, .checkboxRow, .optionPick, .scrollPick, and .lookGroupPick on a group's dropdown.
- Use the app's colors through CSS variables: var(--text), var(--textMuted), var(--surface), var(--surfaceRaised), var(--border), var(--accent). Do not write hex colors.
- No @import, no url() to other sites.
- Keep it compact. The panel is a narrow sidebar, about 300px wide.`

/** What the model is told about one variable. The label and shape, never what it switches on. */
function declaration(v: StackVariable) {
  const base = { id: v.id, label: v.label, kind: v.kind, value: v.value }
  if (v.kind === 'dropdown') return { ...base, options: v.options }
  if (v.kind === 'sliderSingle' || v.kind === 'sliderRange') return { ...base, min: v.min, max: v.max, step: v.step }
  return base
}

export function buildLookMessages(ask: string, variables: StackVariable[], look?: StackLook): ChatMessage[] {
  const current = look?.html.trim() || look?.css.trim()
    ? `The current layout:\n${JSON.stringify({ html: look.html, css: look.css, hideUnplaced: !!look.hideUnplaced }, null, 2)}\n\n`
    : 'There is no layout yet.\n\n'
  return [
    { role: 'system', content: lookPrompt },
    {
      role: 'user',
      content: `The variables:\n${JSON.stringify(variables.map(declaration), null, 2)}\n\n${current}${ask.trim() || 'Design a clear layout for these settings.'}`,
    },
  ]
}

const lookSchema = {
  type: 'object',
  properties: { html: { type: 'string' }, css: { type: 'string' }, hideUnplaced: { type: 'boolean' } },
  required: ['html', 'css', 'hideUnplaced'],
  additionalProperties: false,
}

export function lookFormat(mode: StructuredMode): Record<string, unknown> {
  if (mode === 'none') return {}
  if (mode === 'object') return { response_format: { type: 'json_object' } }
  return { response_format: { type: 'json_schema', json_schema: { name: 'look', strict: true, schema: lookSchema } } }
}

export function parseLookReply(text: string): StackLook {
  const json = firstJsonObject(text)
  if (!json) throw new Error('The reply had no JSON object in it.')
  let raw: { html?: unknown; css?: unknown; hideUnplaced?: unknown }
  try {
    raw = JSON.parse(json)
  } catch (err) {
    throw new Error(`The reply's JSON didn't parse: ${(err as Error).message}`)
  }
  if (typeof raw.html !== 'string') throw new Error('The reply had no html field.')
  return {
    html: raw.html,
    css: typeof raw.css === 'string' ? raw.css : '',
    ...(raw.hideUnplaced === true ? { hideUnplaced: true } : {}),
  }
}
