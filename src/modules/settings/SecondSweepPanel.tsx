import { useEffect, useState } from 'react'
import { usePipelines } from '../../core/stores/pipelineStore'
import PipelineLibrary from './pipeline/PipelineLibrary'
import PipelineEditor from './pipeline/PipelineEditor'
import './settings.css'

/**
 * Second Sweep: the pipeline library, or the editor for whichever pipeline is open.
 *
 * One tab, two views, and a back link between them. Not a route and not a hash: a pipeline's id is
 * a Dexie row number, so a URL naming one means something different on another machine and nothing
 * at all after a backup restore.
 *
 * The five sub-tabs this replaced (Setup, Stages, Checks, Rules, Hammer) are gone. A pipeline is an
 * ordered list of stages fed by one set of detectors, and the diagram says that where a tab strip
 * could not.
 */
export default function SecondSweepPanel() {
  const { pipelines, loaded, load } = usePipelines()
  const [openId, setOpenId] = useState<number | null>(null)

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  const open = pipelines.find((p) => p.id === openId)

  return (
    <div className="passPanel">
      {open ? (
        <PipelineEditor pipeline={open} onClose={() => setOpenId(null)} />
      ) : (
        <PipelineLibrary onOpen={setOpenId} />
      )}
    </div>
  )
}
