import { RiSettings3Line } from '@remixicon/react'
import { lazyView, registerModule } from '../../app/moduleRegistry'
import { tabs } from './tabs'

registerModule({
  id: 'settings',
  label: 'Settings',
  icon: RiSettings3Line,
  route: '/settings',
  component: lazyView(() => import('./SettingsView')),
  tabs,
})
