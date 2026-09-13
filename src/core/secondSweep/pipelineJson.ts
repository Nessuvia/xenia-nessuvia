// Extension-ful imports on purpose: checkPipelineJson.ts runs this under
// `node --experimental-strip-types`.
import { tryCompile } from '../hammer/pattern.ts'
import type { LexiconEntry } from '../quality/lexicon.ts'
import { resolveDetect, type DetectSettings } from './detectSettings.ts'
import type { Rule } from './rules.ts'
import {
  newPipeline,
  resolveStage,
  type Pipeline,
  type Stage,
  type StageKind,
} from './pipeline.ts'

/**
 * Pipelines in and out as JSON, so one can be written in a file, pasted from somewhere, or handed
 * to someone else.
 *
 * This is the reason the framework is data rather than code. A pipeline is prose about prose: the
 * rules, the rewrite preset, the weights and the order they run in, all of which are opinions, and
 * authoring them through a form is miserable. The build ships two starters and no further opinion.
 *
 * Untrusted input. A rule's `find` becomes a RegExp or a compiled pattern, a note goes into a
 * prompt, and a preset becomes a system prompt. All of it is checked here rather than where it is
 * used, and a bad file is rejected whole rather than half-imported.
 */

/** What `exportPipelines` writes and `parsePipelineFile` recognises. */
const FORMAT = 'nessuTavern.pipelines'

export function exportPipelines(pipelines: Pipeline[]): string {
  // `id`, `ownerId` and `updatedAt` are this install's bookkeeping and mean nothing to whoever
  // opens the file. Left out: an exported pipeline is only the opinion it carries.
  const body = pipelines.map(({ id: _i, ownerId: _o, updatedAt: _u, ...rest }) => rest)
  return JSON.stringify({ format: FORMAT, pipelines: body }, null, 2)
}

export function downloadPipelines(pipelines: Pipeline[]) {
  const url = URL.createObjectURL(
    new Blob([exportPipelines(pipelines)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  const name = pipelines.length === 1 ? slug(pipelines[0].label) : 'pipelines'
  link.download = `XeniaNessuvia-${name}-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

function slug(label: string): string {
  return label.trim().replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pipeline'
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function obj(raw: unknown, what: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`${what} is not an object.`)
  }
  return raw as Record<string, unknown>
}

/**
 * One rule from a pasted file.
 *
 * Three shapes arrive here. The current one carries `match`. A file written before the rule merge
 * carries either `pattern` (a Grammar Hammer rule) or `regex` with no `match` (a free-text rule),
 * and both are read into the merged shape rather than refused. What a user exported still imports.
 */
function oneRule(raw: unknown, index: number): Rule {
  const r = obj(raw, `Rule ${index + 1}`)
  const match = readMatch(r)
  // `pattern` was the hammer's field name for the same thing.
  const find = str(match === 'pattern' && r.find === undefined ? r.pattern : r.find)
  const note = str(r.note)
  const caseSensitive = bool(r.caseSensitive, false)

  // A rule with neither has nothing to match and nothing to say. The runner skips it silently,
  // which would make a typo in a pasted file look like a successful import.
  if (!find.trim() && !note.trim()) {
    throw new Error(`Rule ${index + 1} has no find and no note.`)
  }

  // Compiled here rather than at run time: a bad find in a pasted file should be an import error
  // naming the rule, not a row that silently matches nothing.
  if (find.trim()) {
    if (match === 'pattern') {
      const compiled = tryCompile(find.trim(), caseSensitive)
      if ('error' in compiled) {
        throw new Error(`Rule ${index + 1} has a bad pattern: ${compiled.error}`)
      }
    } else if (match === 'regex') {
      try {
        new RegExp(find)
      } catch (err) {
        throw new Error(`Rule ${index + 1} has a bad regex: ${(err as Error).message}`)
      }
    }
  }

  // A legacy text rule had no action and could only ever flag.
  const action: Rule['action'] =
    r.action === 'strip' || r.action === 'replace' || r.action === 'flag' ? r.action : 'flag'

  return {
    // Always a fresh id. An imported file may carry ids already in the list, and the same rule
    // twice under one id is worse than the same rule twice.
    id: crypto.randomUUID(),
    enabled: bool(r.enabled, true),
    label: str(r.label) || undefined,
    match,
    find: match === 'pattern' ? find.trim() : find,
    caseSensitive,
    scope: r.scope === 'user' || r.scope === 'both' ? r.scope : 'assistant',
    action,
    ...(action === 'replace' ? { replacement: str(r.replacement) } : {}),
    note,
  }
}

function readMatch(r: Record<string, unknown>): Rule['match'] {
  if (r.match === 'literal' || r.match === 'regex' || r.match === 'pattern') return r.match
  if (typeof r.pattern === 'string') return 'pattern'
  return bool(r.regex, false) ? 'regex' : 'literal'
}

function oneLexiconEntry(raw: unknown, index: number): LexiconEntry {
  const e = obj(raw, `Lexicon entry ${index + 1}`)
  const phrase = str(e.phrase).trim()
  if (!phrase) throw new Error(`Lexicon entry ${index + 1} has no phrase.`)
  return {
    id: str(e.id) || crypto.randomUUID(),
    phrase,
    regex: bool(e.regex, false),
    enabled: bool(e.enabled, true),
    weight: num(e.weight, 1),
  }
}

const kinds: StageKind[] = ['gate', 'clean', 'rewrite', 'score']

function oneStage(raw: unknown, index: number): Stage {
  const s = obj(raw, `Stage ${index + 1}`)
  const kind = kinds.find((k) => k === s.kind)
  if (!kind) {
    // Named rather than skipped. A pipeline built around a stage this build does not have would
    // run as something other than what its author wrote, which is worse than refusing it.
    throw new Error(`Stage ${index + 1} has an unknown kind: ${JSON.stringify(s.kind)}`)
  }
  const config = s.config && typeof s.config === 'object' ? s.config : {}
  // `resolveStage` fills every field of the config from the defaults: a file carrying half a
  // config is completed rather than rejected. The kind is the only part that has to be right.
  return resolveStage({
    id: crypto.randomUUID(),
    label: str(s.label) || kind,
    enabled: bool(s.enabled, true),
    kind,
    config,
  } as Stage)
}

function onePipeline(raw: unknown, index: number): Pipeline {
  const p = obj(raw, `Pipeline ${index + 1}`)
  const rawStages = p.stages ?? []
  if (!Array.isArray(rawStages)) throw new Error(`Pipeline ${index + 1}: "stages" is not a list.`)
  const stages = rawStages.map(oneStage)
  if (!stages.length) throw new Error(`Pipeline ${index + 1} has no stages.`)

  const rawDetect = p.detect && typeof p.detect === 'object' ? (p.detect as Record<string, unknown>) : {}
  // Both lists in a pre-merge file, in the order they ran: hammer rules, then free-text rules.
  const rawText = rawDetect.textRules ?? []
  const rawRules = rawDetect.rules ?? []
  const rawLexicon = p.lexicon ?? []
  if (!Array.isArray(rawText)) throw new Error(`Pipeline ${index + 1}: "textRules" is not a list.`)
  if (!Array.isArray(rawRules)) throw new Error(`Pipeline ${index + 1}: "rules" is not a list.`)
  if (!Array.isArray(rawLexicon)) throw new Error(`Pipeline ${index + 1}: "lexicon" is not a list.`)

  const base = newPipeline(str(p.label).trim() || `Pipeline ${index + 1}`)
  return {
    ...base,
    description: str(p.description),
    detect: resolveDetect({
      punctuation: rawDetect.punctuation as DetectSettings['punctuation'],
      rules: [...rawRules, ...rawText].map(oneRule),
    }),
    lexicon: rawLexicon.map(oneLexiconEntry),
    census: { ...base.census, ...(p.census as object) },
    stages,
  }
}

/**
 * Read a pipeline file. Three shapes are accepted, because all three are things a person has to
 * hand: what `exportPipelines` wrote, a bare array, and a single pipeline object.
 */
export function parsePipelineFile(text: string): Pipeline[] {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (err) {
    throw new Error(`Not JSON: ${(err as Error).message}`)
  }

  const bundle =
    data && typeof data === 'object' && !Array.isArray(data) && 'pipelines' in data
      ? (data as { pipelines?: unknown })
      : null

  const raw = bundle ? (bundle.pipelines ?? []) : Array.isArray(data) ? data : [data]
  if (!Array.isArray(raw)) throw new Error('"pipelines" is not a list.')

  const pipelines = raw.map(onePipeline)
  if (!pipelines.length) throw new Error('No pipelines in that file.')
  return pipelines
}
