import file from './bundled/pipelines.json'
import { parsePipelineFile } from './pipelineJson'
import type { Pipeline } from './pipeline'

/**
 * The two pipelines that ship with the build, as a file rather than as code: they go through the
 * same parser as a pasted import, so they get fresh ids and cannot be a shape the import path
 * would reject. Nothing loads them on its own. They are behind a button, like any other import.
 *
 * Two, so the choice the framework offers is visible without reading the docs. The light one is
 * the detectors plus one edit request on the same connection. The full one adds a second model
 * and scores what it sends back. Both are worked examples rather than curated prompts; editing
 * them is an edit to `bundled/pipelines.json` and nothing else.
 */
export function bundledPipelines(): Pipeline[] {
  // stringify to reuse the import path's coercion rather than a second parser.
  return parsePipelineFile(JSON.stringify(file))
}
