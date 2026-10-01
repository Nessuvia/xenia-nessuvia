import type { ReactNode } from 'react'
import './pageHeader.css'

/** The top of a full page: title on the left, actions on the right, an optional one-line hint
 *  under them, and the page's tab bar (if any) as children below that. Every top-level screen uses
 *  it, so the title and the page's main buttons sit in the same place everywhere. */
export default function PageHeader({
  title,
  hint,
  actions,
  children,
}: {
  title: ReactNode
  hint?: ReactNode
  actions?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="pageHeader">
      <div className="pageHeaderRow">
        <h2 className="pageHeaderTitle">{title}</h2>
        {actions && <div className="pageHeaderActions">{actions}</div>}
      </div>
      {hint && <p className="hint pageHeaderHint">{hint}</p>}
      {children}
    </header>
  )
}
