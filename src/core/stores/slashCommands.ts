// Extension-ful imports on purpose (there are none yet, but keep the rule): checkSlashCommands.ts
// runs this under `node --experimental-strip-types`.

/** One command the composer offers and `send` knows how to run. */
export interface SlashCommand {
  name: string
  /** A second name that runs the same command. Parsing normalises it to `name`. */
  alias?: string
  /** One line in the menu. */
  hint: string
  usage: string
  /** The first argument is a character name, completed from the roster. */
  takesCharacter: boolean
}

export const slashCommands: SlashCommand[] = [
  {
    name: 'sendas',
    hint: 'Post a message as a character in this chat.',
    usage: '/sendas <character> <text>',
    takesCharacter: true,
  },
  {
    name: 'continue',
    hint: 'Carry on the last reply from where it stopped.',
    usage: '/continue',
    takesCharacter: false,
  },
  {
    name: 'noreply',
    hint: 'Post your message without a reply.',
    usage: '/noreply <text>',
    takesCharacter: false,
  },
  {
    name: 'break',
    alias: 'br',
    hint: 'Draw a line across the chat.',
    usage: '/break',
    takesCharacter: false,
  },
]

export interface ParsedCommand {
  name: string
  /** The character name as typed, when the command takes one. Not yet resolved to an id. */
  target?: string
  /** Everything after the command and its argument. */
  text: string
}

const commandBy = (name: string) =>
  slashCommands.find((c) => c.name === name || c.alias === name)

/**
 * The longest roster name `rest` starts with, case-insensitive, respecting a word boundary so
 * "Anna" doesn't swallow the front of "Annabelle". Longest-first is what makes a two-word name
 * beat the one-word name it starts with.
 */
function matchName(rest: string, names: string[]): string | undefined {
  const lower = rest.toLowerCase()
  let best: string | undefined
  for (const name of names) {
    if (!name) continue
    if (!lower.startsWith(name.toLowerCase())) continue
    const after = rest.charAt(name.length)
    if (after && !/\s/.test(after)) continue
    if (!best || name.length > best.length) best = name
  }
  return best
}

/**
 * A leading slash command, or null when the text is an ordinary message. Only a `/` in the very
 * first column counts, and `//` escapes it, `//me` is a message that starts with a slash, which
 * `stripEscape` below takes care of.
 *
 * An unknown command name is not an error: it parses to null and sends verbatim. A message that
 * happens to open with a slash is never eaten.
 *
 * `names` is the roster. A command that takes a character matches greedily against it because
 * character names contain spaces; no match falls back to the first whitespace token so the caller
 * can name what was typed in the error.
 */
export function parseCommand(raw: string, names: string[]): ParsedCommand | null {
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  const body = raw.slice(1)
  const nameEnd = body.search(/\s/)
  const name = (nameEnd === -1 ? body : body.slice(0, nameEnd)).toLowerCase()
  const command = commandBy(name)
  if (!command) return null

  const rest = (nameEnd === -1 ? '' : body.slice(nameEnd + 1)).replace(/^\s+/, '')
  // An alias reports the canonical name: callers only ever switch on one string.
  if (!command.takesCharacter) return { name: command.name, text: rest }

  const matched = matchName(rest, names)
  const target = matched ?? (rest.split(/\s/)[0] || '')
  return { name: command.name, target, text: rest.slice(target.length).replace(/^\s+/, '') }
}

/** Undo the `//` escape. Applied to text that parsed as an ordinary message. */
export function stripEscape(raw: string): string {
  return raw.startsWith('//') ? raw.slice(1) : raw
}

export interface CharacterTarget {
  id: number
  name: string
  avatar?: string
}

export type CommandMenu =
  | { kind: 'commands'; items: SlashCommand[] }
  | { kind: 'characters'; items: CharacterTarget[] }

/**
 * What the popup should show for the text typed so far, or null for no popup. While the command
 * name is being typed the list is commands filtered by prefix; once the name is complete and the
 * command takes a character, it becomes the roster filtered the same way. That narrowing is the
 * whole interaction.
 */
export function menuFor(raw: string, targets: CharacterTarget[]): CommandMenu | null {
  if (!raw.startsWith('/') || raw.startsWith('//')) return null
  const body = raw.slice(1)
  const nameEnd = body.search(/\s/)

  // Still typing the name: no whitespace yet.
  if (nameEnd === -1) {
    const typed = body.toLowerCase()
    const items = slashCommands.filter(
      (c) => c.name.startsWith(typed) || !!c.alias?.startsWith(typed),
    )
    return items.length ? { kind: 'commands', items } : null
  }

  const command = commandBy(body.slice(0, nameEnd).toLowerCase())
  if (!command || !command.takesCharacter) return null

  const rest = body.slice(nameEnd + 1).replace(/^\s+/, '')
  // A complete name followed by a space means the argument is settled. The menu's job is done.
  const matched = matchName(rest, targets.map((t) => t.name))
  if (matched && /\s/.test(rest.slice(matched.length))) return null

  const items = targets.filter((t) => t.name.toLowerCase().startsWith(rest.toLowerCase()))
  return items.length ? { kind: 'characters', items } : null
}

/** The text after accepting a menu item, what the composer writes back into the draft. */
export function completeWith(raw: string, item: SlashCommand | CharacterTarget): string {
  if ('usage' in item) return `/${item.name} `
  const body = raw.slice(1)
  const nameEnd = body.search(/\s/)
  const commandName = nameEnd === -1 ? body : body.slice(0, nameEnd)
  return `/${commandName} ${item.name} `
}
