import PalettesPanel from './PalettesPanel'
import BackgroundsPanel from './BackgroundsPanel'
import TextRulesView from './TextRulesView'
import { useHashTab } from '../../app/useHashTab'
import PageHeader from '../../app/PageHeader'
import '../../app/formPage.css'
import './appearance.css'

export { tabs } from './tabs'
import { tabs } from './tabs'

export default function AppearanceView() {
  const [tab, setTab] = useHashTab(tabs.map(([id]) => id))

  return (
    <div className="appearancePage formPage screenFrame">
      <PageHeader title="Palette">
        <nav className="navbar pageTabs">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`pageTab${tab === id ? ' current' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </PageHeader>

      {/* Themes brings its own scrolling columns; Backgrounds is one column and takes the frame's. */}
      {tab === 'themes' ? (
        <PalettesPanel />
      ) : tab === 'textRules' ? (
        <TextRulesView />
      ) : (
        <div className="screenBody">
          <BackgroundsPanel />
        </div>
      )}
    </div>
  )
}
