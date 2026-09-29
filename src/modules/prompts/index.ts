import { RiStackLine } from '@remixicon/react'
import { lazyView, registerModule } from '../../app/moduleRegistry'

registerModule({
  id: 'prompts',
  label: 'Prompts',
  icon: RiStackLine,
  route: '/prompts',
  tabs: [
    ['stacks', 'Stacks'],
    ['look', 'Look'],
    ['misc', 'Misc Prompts'],
  ],
  component: lazyView(() => import('./StackEditor')),
})
