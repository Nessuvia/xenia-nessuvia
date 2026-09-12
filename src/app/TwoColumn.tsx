import type { ReactNode } from 'react'
import './twoColumn.css'

/** List on the left, details for the selected row on the right. Each column scrolls on its own.
 *  The page itself never does: this is the .screenBody of the screen that uses it. Pass no detail
 *  and the list takes the full width. */
export default function TwoColumn({ list, detail }: { list: ReactNode; detail?: ReactNode }) {
  return (
    <div className={`twoColumn screenBody ${detail ? 'split' : ''}`}>
      <div className="twoColumnList">{list}</div>
      {detail && <div className="twoColumnDetail">{detail}</div>}
    </div>
  )
}
