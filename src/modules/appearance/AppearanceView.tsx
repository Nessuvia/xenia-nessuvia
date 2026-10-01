import PalettesPanel, { PaletteActions } from './PalettesPanel'
import BackgroundsPanel from './BackgroundsPanel'
import TextRulesView from './TextRulesView'
import { useHashTab } from '../../app/useHashTab'
import PageHeader from '../../app/PageHeader'
import PageTabs from '../../app/PageTabs'
import '../../app/formPage.css'
import './appearance.css'

export { tabs } from './tabs'
import { tabs } from './tabs'

export default function AppearanceView() {
  const [tab, setTab] = useHashTab(tabs.map(([id]) => id))

  return (
    <div className="appearancePage formPage screenFrame">
      <PageHeader title="Palette" actions={tab === 'themes' && <PaletteActions />}>
        <PageTabs tabs={tabs} current={tab} onPick={setTab} />
      </PageHeader>

      {/* Every tab brings its own scrolling: Themes and Backgrounds have two columns that scroll apart. */}
      {tab === 'themes' ? (
        <PalettesPanel />
      ) : tab === 'textRules' ? (
        <TextRulesView />
      ) : (
        <BackgroundsPanel />
      )}
    </div>
  )
}
