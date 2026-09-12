// Extension-ful imports on purpose: checkTemplateFile.ts runs this under
// `node --experimental-strip-types`, which can't resolve extensionless app imports.
import type { InstructTemplate } from './paramDef.ts'
import { defaultTemplate } from './paramDef.ts'

/** A template on its own, as a file. Named so a user can tell two of them apart in a folder. */
export interface TemplateFile {
  kind: 'xeniaInstructTemplate'
  version: 1
  name: string
  template: InstructTemplate
}

/**
 * A template as a shareable file. The endpoint and the API key are not in the shape at all, so
 * there is no path by which a shared template carries a secret; a template is a fact about a model
 * and the connection is the account.
 */
export function templateToJson(name: string, template: InstructTemplate): string {
  const file: TemplateFile = { kind: 'xeniaInstructTemplate', version: 1, name, template }
  return JSON.stringify(file, null, 2)
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback

/**
 * Read a template file. Throws with a message meant for the user.
 *
 * Every field is read by name off an untrusted file: a template arrives by email like a character
 * card does. Missing sequences fall back to ChatML's rather than to undefined, so a half-written
 * file still sends something instead of producing a prompt with `undefined` in it.
 */
export function templateFromJson(source: string): { name: string; template: InstructTemplate } {
  let data: unknown
  try {
    data = JSON.parse(source)
  } catch {
    throw new Error('That file is not JSON.')
  }
  if (!isObject(data)) throw new Error('That file is not a template.')
  if (data.kind !== 'xeniaInstructTemplate') {
    throw new Error('That file is not an instruct template. Use the SillyTavern import for theirs.')
  }
  if (!isObject(data.template)) throw new Error('That template file has no template in it.')

  const raw = data.template
  const base = defaultTemplate()
  const template: InstructTemplate = {
    systemPrefix: str(raw.systemPrefix, base.systemPrefix),
    systemSuffix: str(raw.systemSuffix, base.systemSuffix),
    userPrefix: str(raw.userPrefix, base.userPrefix),
    userSuffix: str(raw.userSuffix, base.userSuffix),
    modelPrefix: str(raw.modelPrefix, base.modelPrefix),
    modelSuffix: str(raw.modelSuffix, base.modelSuffix),
    stopSequences: Array.isArray(raw.stopSequences)
      ? raw.stopSequences.filter((s): s is string => typeof s === 'string')
      : [],
    trimTrailingSpace: raw.trimTrailingSpace !== false,
  }
  if (str(raw.firstPrefix)) template.firstPrefix = str(raw.firstPrefix)
  if (str(raw.firstModelPrefix)) template.firstModelPrefix = str(raw.firstModelPrefix)
  if (str(raw.lastModelPrefix)) template.lastModelPrefix = str(raw.lastModelPrefix)
  if (str(raw.prefill)) template.prefill = str(raw.prefill)
  if (raw.systemAsUser === true) template.systemAsUser = true
  if (raw.wrapNewlines === true) template.wrapNewlines = true
  if (raw.expandMacros === false) template.expandMacros = false
  if (raw.sequencesAsStops === true) template.sequencesAsStops = true
  if (raw.names === 'never' || raw.names === 'always' || raw.names === 'group') {
    template.names = raw.names
  }
  if (isObject(raw.reasoning) && str(raw.reasoning.prefix)) {
    template.reasoning = {
      prefix: str(raw.reasoning.prefix),
      suffix: str(raw.reasoning.suffix),
      autoParse: raw.reasoning.autoParse !== false,
      sendBack: raw.reasoning.sendBack === true,
      ...(typeof raw.reasoning.maxSendBack === 'number'
        ? { maxSendBack: raw.reasoning.maxSendBack }
        : {}),
    }
  }
  return { name: str(data.name).trim() || 'Imported template', template }
}
