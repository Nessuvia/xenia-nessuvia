import type { Step, Tour } from './types.ts'

const sides = ['left', 'right', 'top', 'bottom'] as const
const layouts = ['desktop', 'mobile'] as const

/**
 * A tour file to steps. `#` on the first line is the display name, `##` starts a step, and the rest
 * of that line is the target selector followed by pipe-separated directives:
 *
 *     ## .chatSidebar | left | desktop
 *
 * `center` in the selector slot means a step with no target. A `##` with nothing after it is not a
 * step. Its body is dropped rather than attached to the step above: a heading marks a break either
 * way.
 */
export function parseTour(id: string, source: string): Tour {
  const steps: Step[] = []
  let name = id
  let current: Step | null = null
  let body: string[] = []

  const flush = () => {
    if (current) {
      current.body = body.join('\n').split(/\n{2,}/).map((p) => p.trim().replace(/\n+/g, ' ')).filter(Boolean)
      steps.push(current)
    }
    current = null
    body = []
  }

  for (const line of source.split(/\r?\n/)) {
    if (line.startsWith('## ') || line === '##') {
      flush()
      const parts = line.slice(2).split('|').map((p) => p.trim())
      const target = parts.shift() ?? ''
      if (!target) continue
      const step: Step = { target: target === 'center' ? '' : target, body: [] }
      for (const directive of parts) {
        if ((sides as readonly string[]).includes(directive)) step.side = directive as Step['side']
        else if ((layouts as readonly string[]).includes(directive)) step.only = directive as Step['only']
      }
      current = step
      continue
    }
    if (line.startsWith('# ')) {
      name = line.slice(2).trim() || name
      continue
    }
    if (current) body.push(line)
  }
  flush()

  return { id, name, steps }
}
