import { RiPokerHeartsLine } from '@remixicon/react'
import { lazyView, registerModule } from '../../app/moduleRegistry'
import './games.css'

// No chatPanels and no decorateMessage: a game isn't a chat, and nothing here belongs in one.
registerModule({
  id: 'games',
  label: 'Games',
  icon: RiPokerHeartsLine,
  route: '/games',
  component: lazyView(() => import('./GamesView')),
  tabs: [
    ['play', 'Play'],
    ['history', 'History'],
  ],
})
