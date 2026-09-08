import file from './bundled/nessuRules.json'
import { parseRuleFile, type RuleFile } from './ruleJson'

/**
 * The one rule set that ships with the build, as a file rather than as code: it goes through the
 * same parser as a pasted import, so it gets fresh ids and cannot be a shape the import path would
 * reject. Nothing loads it on its own. It is behind a button, like any other import.
 *
 * Editing the recommendations is an edit to `bundled/nessuRules.json` and nothing else.
 */
export function bundledRules(): RuleFile {
  // stringify to reuse the import path's coercion rather than a second parser.
  return parseRuleFile(JSON.stringify(file))
}
