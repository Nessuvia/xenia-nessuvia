import { RiStackLine } from '@remixicon/react'
import { lazyView, registerModule } from '../../app/moduleRegistry'
import { tabs } from './tabs'

registerModule({
  id: 'prompts',
  label: 'Prompts',
  icon: RiStackLine,
  route: '/prompts',
  tabs,
  component: lazyView(() => import('./StackEditor')),
})
