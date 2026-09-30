// A look's `data-group`: several checkbox variables shown as one dropdown, at most one on. For
// imported presets that spell a single choice (POV, chain of thought) as a row of checkboxes. The
// template is untouched: picking an option writes true to one checkbox and false to the rest.

/** `data-group="a, b, c"` to ids. */
export const groupIds = (attr: string) => attr.split(',').map((s) => s.trim()).filter(Boolean)

/** The option to show: the first id that's on, or '' for none. More than one on (an imported
 *  state) shows the first; the next pick switches the others off. */
export const groupPick = (ids: string[], values: Record<string, unknown>) => ids.find((id) => values[id] === true) ?? ''

/** Values for picking `chosen` ('' = none). */
export const groupWrite = (ids: string[], chosen: string) => Object.fromEntries(ids.map((id) => [id, id === chosen]))
