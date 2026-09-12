import { Navigate, Route, Routes } from 'react-router-dom'
import CharacterPicker from './CharacterPicker'
import CharacterSheet from './CharacterSheet'
import ChatView from './ChatView'
import TagsPage from './TagsPage'

// The module owns its subroutes. Split out of index.ts: index registers a lazy component
// without importing the views.
export default function ChatModule() {
  return (
    <Routes>
      <Route index element={<CharacterPicker />} />
      {/* The open character lives in the URL: clicking Chat in the sidebar closes it. */}
      <Route path="c/new" element={<CharacterSheet />} />
      {/* Reading and editing are the same page. /edit survives only for an open bookmark to land. */}
      <Route path="c/:characterId/edit" element={<Navigate to=".." replace />} />
      <Route path="c/:characterId" element={<CharacterSheet />} />
      {/* Above :chatId, which would otherwise swallow it. */}
      <Route path="tags" element={<TagsPage />} />
      <Route path=":chatId" element={<ChatView />} />
    </Routes>
  )
}
