import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import './app/skins' // pulls in every skin stylesheet
import './modules/chat' // self-registers into moduleRegistry
import './modules/write'
import './modules/multiplayer'
import './modules/ask'
import './modules/slopdentifier'
import './modules/characters'
import './modules/personas'
import './modules/games'
import './modules/lorebooks'
import './modules/prompts'
import './modules/appearance'
import './modules/settings'
import './modules/bodyMap' // a plugin: off until enabled in Settings > Miscellaneous
// Sits under Import/Export in the rail, not in the main nav, Sidebar guards its two sync entries
// with `syncModule &&`, so commenting this line out is still the whole off switch.
import './modules/sync'

// A WIP tab that ships: registered everywhere, so /learn resolves on live, but the rail only shows
// its button on dev (see Sidebar.tsx).
import './modules/learn'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
