import './pageHeader.css'

/** The tab bar under a page title. Goes inside <PageHeader> as its child. Every page with tabs
 *  uses it, fed by the same `[id, label]` list the module registers for its sidebar sub-items. */
export default function PageTabs<T extends string>({
  tabs,
  current,
  onPick,
}: {
  tabs: readonly (readonly [T, string])[]
  current: T
  onPick: (id: T) => void
}) {
  return (
    <nav className="navbar pageTabs">
      {tabs.map(([id, label]) => (
        <button
          key={id}
          type="button"
          className={`pageTab${current === id ? ' current' : ''}`}
          onClick={() => onPick(id)}
        >
          {label}
        </button>
      ))}
    </nav>
  )
}
