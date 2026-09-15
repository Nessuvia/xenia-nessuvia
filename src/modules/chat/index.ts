import { RiChat3Line } from '@remixicon/react'
import { lazyView, registerModule } from '../../app/moduleRegistry'
import TrackerPanel from './TrackerPanel'
import './chat.css'

registerModule({
  id: 'chat',
  label: 'Chat',
  icon: RiChat3Line,
  route: '/chat',
  component: lazyView(() => import('./ChatModule')),
  chatPanels: [{ label: 'Trackers', component: TrackerPanel }],
})
