// Its own file: the module's index registers the tab list without pulling in the view, which is
// lazily loaded.
export const tabs = [
  ['stacks', 'Stacks'],
  ['look', 'Look'],
  ['misc', 'Misc Prompts'],
  ['defaults', 'Defaults'],
] as const
