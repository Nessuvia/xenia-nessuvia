import { RiStickyNoteLine } from '@remixicon/react'
import { lazyView, registerModule } from '../../app/moduleRegistry'
import './notes.css'

registerModule({
  id: 'notes',
  label: 'Notes',
  icon: RiStickyNoteLine,
  route: '/notes',
  component: lazyView(() => import('./NotesView')),
})
