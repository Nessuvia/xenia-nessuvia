// Extension-ful imports on purpose: checkPalette.ts runs this under
// `node --experimental-strip-types`, which can't resolve extensionless app imports.
import { defaultPalette, type Palette } from './palette.ts'
import { coerceFields } from './importPalettes.ts'
import type { ChatMessage } from '../connectors/connectorInterface.ts'

/**
 * The built-in prompt. Editable in the Themes tab; an empty stored prompt means this one.
 *
 * It names the app, then every field: the field names are CSS var names and a model given
 * only `surfaceRaised` has to guess. The rules at the end are the ones whose absence produces a
 * palette that looks fine as a list of hex codes and is unusable on screen.
 */
export const defaultPalettePrompt = `You are designing a color scheme for Xenia Nessuvia, a local character-chat and prose-writing app that runs in a browser. It is a dense, quiet, reading-focused interface: a left nav rail, a center column of chat messages or manuscript prose, and settings panels of small controls.

Reply with one JSON object and nothing else. No prose, no explanation, no code fence. Every color is a hex string.

Fields:
- name: a short name for the scheme.
- bg: the page behind everything.
- surfaceSunken: recessed areas, one step from bg.
- surface: panels, cards, inputs.
- surfaceRaised: things sitting above a panel, such as message bubbles and menus.
- surfaceHover: hover state for rows and buttons.
- surfaceActive: pressed state, and the default button face.
- surfaceSelected: the selected row in a list.
- border: hairlines between panels.
- borderStrong: button and input outlines.
- borderAccent: the outline on the active or focused thing.
- text: body text.
- textBright: headings and the highest-contrast text.
- textSoft: secondary text.
- textMuted: labels and captions.
- textDim: placeholders and disabled text.
- accent: links, active nav, focus rings. One color, used sparingly.
- danger: delete buttons and errors.
- overlay: the wash behind a modal. Must carry alpha, as 8-digit hex, roughly 40 to 70 percent.
- textColor, emphasisColor, boldColor, quoteColor: colors for message text, *emphasis*, **bold** and "quoted speech". An empty string means no color for that one.
- storyTextColor, storyEmphasisColor, storyBoldColor, storyQuoteColor: the same four for the prose editor.
- fontFamily: a CSS font stack for chat and story text, or an empty string for the app default.
- appFontFamily: a CSS font stack for the app interface, or an empty string for the app default.
- fontSize: message text size in px, 13 to 18.
- textWeight: base font weight for body text, 300 to 700.
- radius: corner radius in px, 0 to 16.

Rules:
- Every text color must be readable on surface and on surfaceRaised.
- The surface fields form a ramp in the order listed. Keep them ordered and keep each step visible but small.
- accent must be readable against surface, and must not be so close to danger that they read as the same color.
- The marker colors sit on message and prose backgrounds, not on bg. Keep them distinct from text.
- Return every field.`

/**
 * How much structure a connection's endpoint will accept on a request. Not a setting the user
 * picks: it starts undefined, the ladder below finds the first rung that works, and the answer is
 * remembered on the connection.
 */
export type StructuredMode = 'schema' | 'object' | 'none'

const ladder: StructuredMode[] = ['schema', 'object', 'none']

/** What to try, best first, starting from whatever last worked for this connection. */
export function modeLadder(stored?: StructuredMode): StructuredMode[] {
  const at = stored ? ladder.indexOf(stored) : 0
  return ladder.slice(at === -1 ? 0 : at)
}

/**
 * Shape only: field names, types, all required. No hex patterns and no numeric ranges: those are
 * where a strict backend is most likely to refuse the schema, and `coerceFields` already throws out
 * a value of the wrong shape whatever the endpoint did.
 *
 * Built from `defaultPalette` rather than written out: a new palette field can't drift from it.
 */
/**
 * Fields the model is never shown and never asked for. `backgrounds` holds image references and raw
 * CSS: nothing a color scheme should invent, and a nested object is what a strict schema backend
 * refuses. The webfont fields are a user pick from the Fontsource catalog, not a color the model
 * chooses, and a made-up `webfontId` would 404 the CDN. `coerceFields` keeps the base's value for
 * anything missing. Leaving them out preserves whatever the palette already had.
 */
const promptSkipped = [
  'id',
  'ownerId',
  'backgrounds',
  'webfont',
  'webfontId',
  'useWebfont',
  'appWebfont',
  'appWebfontId',
  'useAppWebfont',
  // `skin` is the user's pick and `parsePaletteReply` puts it back regardless. `skinVars` is worse
  // than pointless in the schema: an empty `Record<string, number>` types as a bare
  // `{type:'object'}` with no properties, which a strict json_schema backend either rejects or
  // turns into a grammar that can emit nothing.
  'skin',
  'skinVars',
]

export function paletteSchema(): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(defaultPalette)) {
    if (promptSkipped.includes(key)) continue
    properties[key] = Array.isArray(value)
      ? { type: 'array', items: { type: 'string' } }
      : { type: typeof value }
  }
  return {
    type: 'object',
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  }
}

/** The `response_format` for one rung, or nothing at all for the bottom one. */
export function responseFormat(mode: StructuredMode): Record<string, unknown> {
  if (mode === 'none') return {}
  if (mode === 'object') return { response_format: { type: 'json_object' } }
  return {
    response_format: {
      type: 'json_schema',
      json_schema: { name: 'palette', strict: true, schema: paletteSchema() },
    },
  }
}

/** System prompt, then the palette being edited plus what the user asked for. Sending the current
 *  palette is what lets an ask like "make it warmer" mean anything. */
export function buildPaletteMessages(prompt: string, ask: string, palette: Palette): ChatMessage[] {
  const { id: _id, ownerId: _ownerId, backgrounds: _backgrounds, webfont: _w, webfontId: _wi, useWebfont: _u, appWebfont: _aw, appWebfontId: _awi, useAppWebfont: _au, skin: _skin, skinVars: _skinVars, ...fields } = palette
  const request = ask.trim() || 'Design a new scheme.'
  return [
    { role: 'system', content: prompt.trim() || defaultPalettePrompt },
    {
      role: 'user',
      content: `The current scheme:\n${JSON.stringify(fields, null, 2)}\n\n${request}`,
    },
  ]
}

/**
 * The reply, as palette fields. Models fence the object, or wrap it in a sentence. The object is
 * cut out rather than parsed whole. Coerced against `base`: anything the model left out or got
 * wrong keeps the value the palette already had.
 */
export function parsePaletteReply(text: string, base: Palette): Palette {
  const json = firstJsonObject(text)
  if (!json) {
    throw new Error(
      text.includes('{')
        ? 'The reply started a JSON object but never closed it. It was probably cut off.'
        : 'The reply had no JSON object in it.',
    )
  }
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch (err) {
    throw new Error(`The reply's JSON did not parse: ${(err as Error).message}`)
  }
  const next = coerceFields(raw, base)
  // The name is the one field worth keeping tidy: a model that skips it leaves the old name.
  next.name = String(next.name).trim() || base.name
  // Structure is the user's pick. The response schema has no `skin` property. An endpoint that
  // ignores the schema could still send one.
  next.skin = base.skin
  next.skinVars = base.skinVars
  return next
}

/** The first balanced `{…}` in the text, ignoring braces inside strings. Exported because every
 *  one-shot JSON request has the same problem: a model that fences the object or wraps it in a
 *  sentence, and one scanner is enough. `core/prompt/outline.ts` is the other caller. */
export function firstJsonObject(text: string): string {
  const start = text.indexOf('{')
  if (start === -1) return ''
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (inString) {
      if (c === '\\') escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return text.slice(start, i + 1)
  }
  return ''
}

/**
 * The two things models get wrong inside a JSON string, fixed: an unescaped `"` and a raw newline.
 * Both come from writing prose into a field. A beat like `She says "no" and leaves` balances as an
 * object. `firstJsonObject` returns it happily and `JSON.parse` is the one that fails.
 *
 * A quote is treated as the string's end only when the next non-space character is structural
 * (`,` `}` `]` `:`) or the text runs out. Anything else is prose and gets escaped. That rule is
 * wrong for a value that legitimately ends in a quote followed by more prose. Such a value is
 * not valid JSON in the first place, and there is nothing correct to lose.
 *
 * Returns the text unchanged when nothing needed fixing: a caller can tell a repair happened.
 */
export function repairJsonStrings(text: string): string {
  let out = ''
  let inString = false
  let escaped = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (!inString) {
      out += c
      if (c === '"') inString = true
      continue
    }
    if (escaped) {
      out += c
      escaped = false
      continue
    }
    if (c === '\\') {
      out += c
      escaped = true
      continue
    }
    if (c === '"') {
      let j = i + 1
      while (j < text.length && (text[j] === ' ' || text[j] === '\t' || text[j] === '\n' || text[j] === '\r')) j++
      if (j >= text.length || text[j] === ',' || text[j] === '}' || text[j] === ']' || text[j] === ':') {
        out += c
        inString = false
      } else {
        out += '\\"'
      }
      continue
    }
    // A raw control character is never legal inside a JSON string. Newlines and tabs are what a
    // model actually emits; anything else in that range is dropped rather than guessed at.
    if (c === '\n') out += '\\n'
    else if (c === '\r') out += '\\r'
    else if (c === '\t') out += '\\t'
    else if (c < ' ') continue
    else out += c
  }
  return out
}
