import { RiCloseLine, RiLightbulbLine } from '@remixicon/react'
import { useChats } from '../../core/stores/chatStore'
import { useIdeas } from '../../core/stores/ideasStore'
import { useCharacters } from '../../core/stores/charactersStore'
import { usePersonas } from '../../core/stores/personasStore'
import { useSettings } from '../../core/stores/settingsStore'

/** "Suggest ideas" and the chips it produces, above the input. A picked chip goes with the next send. */
export default function IdeaChips({ disabled }: { disabled: boolean }) {
  const chat = useChats((s) => s.chat)
  const messages = useChats((s) => s.messages)
  const miscPrompts = useChats((s) => s.miscPrompts)
  const { chatId, ideas, picked, suggesting, note, suggest, pick, clear } = useIdeas()
  const characters = useCharacters((s) => s.characters)
  const personas = usePersonas((s) => s.personas)
  const activePersonaId = useSettings((s) => s.activePersonaId)
  if (!chat) return null
  // Fallbacks for messages that carry no name: `name`, not the display name, same as {{char}} elsewhere.
  const names = {
    char: characters.find((c) => c.id === chat.characterId)?.name ?? '',
    user: personas.find((p) => p.id === activePersonaId)?.name ?? '',
  }
  // Ideas suggested in another chat stay out of this one.
  const mine = chatId === chat.id
  const shown = mine ? ideas : []

  return (
    <div className="chatIdeas">
      <button
        type="button"
        className="chatIdeasSuggest"
        disabled={disabled || (mine && suggesting)}
        onClick={() => suggest(chat.id!, messages, miscPrompts, names)}
      >
        <RiLightbulbLine size={14} />
        {mine && suggesting ? 'Suggesting ideas' : 'Suggest ideas'}
      </button>
      {shown.map((idea) => (
        <button
          key={idea}
          type="button"
          className={picked === idea ? 'chatIdeaChip picked' : 'chatIdeaChip'}
          aria-pressed={picked === idea}
          onClick={() => pick(idea)}
        >
          {idea}
        </button>
      ))}
      {mine && (shown.length > 0 || suggesting) && (
        <button type="button" className="chatIdeasClear" title="Clear ideas" aria-label="Clear ideas" onClick={clear}>
          <RiCloseLine size={14} />
        </button>
      )}
      {mine && picked && <span className="hint">The picked idea goes with your next message.</span>}
      {mine && note && <span className="hint">{note}</span>}
    </div>
  )
}
