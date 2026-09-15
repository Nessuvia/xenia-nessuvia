import { RiFilter3Line } from '@remixicon/react'
import { lazyView, registerModule } from '../../app/moduleRegistry'

registerModule({
  id: 'postProcessing',
  label: 'Post-processing',
  icon: RiFilter3Line,
  route: '/post-processing',
  component: lazyView(() => import('./PostProcessingView')),
})
