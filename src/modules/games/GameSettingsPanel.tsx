import { useEffect, useState } from 'react'
import type { MoveQuality } from '../../core/games/goFish'
import { useSettings } from '../../core/stores/settingsStore'
import { useGames } from './gamesStore'

/**
 * The rail for an open game, mirroring the chat's takeover.
 *
 * Deliberately thin. The knobs the plan lists (wait for the reply, notable events only, difficulty)
 * are all later phases, and a control that writes nowhere is worse than no control. Generation
 * settings stay in Settings for now: pointing them at a game would need the fields on the Game
 * record, which is the same per-record upgrade path chats already have.
 */
export default function GameSettingsPanel() {
  const { game, state, abandon, boardScale, setBoardScale, logWidth, setLogWidth } = useGames()
  // A user setting rather than a per-game one: this is how you like to play, not a property of
  // this game. Per-game is the upgrade path, the same one chats have.
  const chatBack = useSettings((s) => s.gameChatBack)
  const setChatBack = useSettings((s) => s.setGameChatBack)
  const chatBackReply = useSettings((s) => s.gameChatBackReply)
  const setChatBackReply = useSettings((s) => s.setGameChatBackReply)
  const soundOff = useSettings((s) => s.gameSoundOff)
  const setSoundOff = useSettings((s) => s.setGameSoundOff)
  const autoSend = useSettings((s) => s.gameAutoSend)
  const setAutoSend = useSettings((s) => s.setGameAutoSend)
  const stepMode = useSettings((s) => s.gameStepMode)
  const setStepMode = useSettings((s) => s.setGameStepMode)
  // Difficulty is per game, not a user setting: it is a property of this match, and changing it
  // halfway through a game you are losing should not rewrite the ones you already played.
  const setDifficulty = useGames((s) => s.setDifficulty)
  const setAuthorNote = useGames((s) => s.setAuthorNote)

  // Typed but not yet written. Null until the first keystroke, so the box shows the stored note
  // and a game that appends events while the panel is open does not fight the field.
  const [draft, setDraft] = useState<string | null>(null)
  useEffect(() => {
    if (draft === null) return
    // Every keystroke is a Dexie write otherwise, and each one rebuilds the board state.
    const timer = setTimeout(() => void setAuthorNote(draft), 600)
    return () => clearTimeout(timer)
  }, [draft, setAuthorNote])

  if (!game) return null

  // Go Fish counts books, Blackjack counts rounds won. Same two numbers either way.
  const goFish = 'books' in state
  const mine = goFish ? state.books.player.length : state.score.player
  const theirs = goFish ? state.books.char.length : state.score.char

  return (
    <div className="gamesRail">
      <div className="gamesScore">
        <span className="gamesScoreSide">
          <span className="gamesScoreName">{game.personaName ?? 'You'}</span>
          <span className={`gamesScoreCount${mine > theirs ? ' gamesScoreCountLead' : ''}`}>{mine}</span>
        </span>
        <span className="gamesScoreDash">-</span>
        <span className="gamesScoreSide">
          <span className="gamesScoreName">{game.characterName}</span>
          <span className={`gamesScoreCount${theirs > mine ? ' gamesScoreCountLead' : ''}`}>{theirs}</span>
        </span>
      </div>

      {/* Blackjack's dealer draws to 17 and has nothing to decide, so there is no skill to set. */}
      {game.kind === 'goFish' && (
        <label className="gamesRailField">
          <span className="gamesRailRow">Difficulty</span>
          <select
            className="gamesRailSelect"
            value={game.difficulty ?? 'average'}
            onChange={(e) => void setDifficulty(e.target.value as MoveQuality)}
          >
            <option value="worst">Easy</option>
            <option value="average">Medium</option>
            <option value="best">Hard</option>
          </select>
        </label>
      )}

      {/* This game's note, not the character's and not the stack's. It reaches the prompt through
          the stack's Author's note block, which is where its position is set. */}
      <label className="gamesRailField">
        <span className="gamesRailRow">Author's note</span>
        <textarea
          className="gamesRailNote"
          rows={3}
          value={draft ?? game.authorNote ?? ''}
          placeholder="{{char}} should be snarky and cunning."
          onChange={(e) => setDraft(e.target.value)}
        />
      </label>
      <p className="gamesRailRow">
        Goes where the Author's note block sits in this game's prompt stack. Applies to this game.
      </p>

      <label className="gamesRailCheck">
        <input type="checkbox" checked={chatBack} onChange={(e) => setChatBack(e.target.checked)} />
        <span className="gamesRailRow">Respond to the character's turn</span>
      </label>
      <p className="gamesRailRow">
        Text that is not a move is kept as something you said. The board does not change.
      </p>

      {chatBack && (
        <label className="gamesRailCheck">
          <input type="checkbox" checked={chatBackReply} onChange={(e) => setChatBackReply(e.target.checked)} />
          <span className="gamesRailRow">Answer it straight away</span>
        </label>
      )}

      <label className="gamesRailCheck">
        <input type="checkbox" checked={!soundOff} onChange={(e) => setSoundOff(!e.target.checked)} />
        <span className="gamesRailRow">Sound</span>
      </label>

      <label className="gamesRailCheck">
        <input type="checkbox" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} />
        <span className="gamesRailRow">Send a clicked card on its own</span>
      </label>
      <p className="gamesRailRow">
        Clicking a card fills the box and sends it after a second and a half. Typing in the box
        stops it.
      </p>

      <label className="gamesRailCheck">
        <input type="checkbox" checked={stepMode} onChange={(e) => setStepMode(e.target.checked)} />
        <span className="gamesRailRow">Wait for Next</span>
      </label>
      <p className="gamesRailRow">
        After {game.characterName} speaks, the table stops until you click Next on their line.
      </p>

      <label className="gamesRailField">
        <span className="gamesRailRow">Board size {boardScale.toFixed(1)}x</span>
        <input
          className="gamesRailSlider"
          type="range"
          min={1}
          max={4}
          step={0.1}
          value={boardScale}
          onChange={(e) => setBoardScale(Number(e.target.value))}
        />
      </label>

      <label className="gamesRailField">
        <span className="gamesRailRow">Log width {logWidth}px</span>
        <input
          className="gamesRailSlider"
          type="range"
          min={220}
          max={720}
          step={10}
          value={logWidth}
          onChange={(e) => setLogWidth(Number(e.target.value))}
        />
      </label>

      {/* The score itself is the marquee at the top of the rail, so it is not repeated here. */}
      <p className="gamesRailRow">Cards left {state.deck.length}</p>
      {game.status === 'playing' && (
        <button type="button" className="gamesRailButton" onClick={() => void abandon()}>
          Abandon game
        </button>
      )}
    </div>
  )
}
