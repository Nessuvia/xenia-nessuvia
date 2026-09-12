import { RiSearchEyeLine } from '@remixicon/react'
import { lazyView, registerModule } from '../../app/moduleRegistry'
import './slopdentifier.css'

registerModule({
  id: 'slopdentifier',
  label: 'Slop-dentifier',
  icon: RiSearchEyeLine,
  route: '/slopdentifier',
  component: lazyView(() => import('./SlopView')),
})
