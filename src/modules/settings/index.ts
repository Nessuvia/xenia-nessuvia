import { RiSettings3Line } from '@remixicon/react'
import { lazyView, registerModule } from '../../app/moduleRegistry'
import { tabs } from './tabs'
import FindReplacePanel from './FindReplacePanel'
import TagRulesPanel from './TagRulesPanel'
import GoldPassChatPanel from './GoldPassChatPanel'

registerModule({
  id: 'settings',
  label: 'Settings',
  icon: RiSettings3Line,
  route: '/settings',
  component: lazyView(() => import('./SettingsView')),
  tabs,
  // Chat-sidebar panels stay eager: they render inside the chat, not behind a route.
  chatPanels: [
    { label: 'Find & Replace', component: FindReplacePanel },
    { label: 'Tags', component: TagRulesPanel },
    { label: 'Gold Pass', component: GoldPassChatPanel },
  ],
})
