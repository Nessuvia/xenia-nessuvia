import { useEffect, useMemo, useState } from 'react'
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import EntityPicker from '../../app/EntityPicker'
import { useHashTab } from '../../app/useHashTab'
import { useMediaQuery } from '../../app/useMediaQuery'
import { useSideDrawer } from '../../app/useSideDrawer'
import { displayName, useCharacters } from '../../core/stores/charactersStore'
import { usePersonas } from '../../core/stores/personasStore'
import { useSettings } from '../../core/stores/settingsStore'
import type { GameKind } from '../../core/games/gameEvent'
import { gameLabels } from '../../core/games/gameEvent'
import type { Game } from '../../core/storage/types'
import { boardState, useGames, type AnyGameState } from './gamesStore'
import GameBoard from './GameBoard'
import GameLog from './GameLog'

const tabs = [['play', 'Play'], ['history', 'History']] as const
type TabId = (typeof tabs)[number][0]

export default function GamesView() {
  return (
    <Routes>
      <Route index element={<GamesHome />} />
      <Route path=":gameId" element={<LiveGame />} />
      <Route path="*" element={<Navigate to="/games" replace />} />
    </Routes>
  )
}

function GamesHome() {
  const [tab] = useHashTab<TabId>(tabs.map((t) => t[0]))
  return tab === 'history' ? <History /> : <Play />
}

// Setup: pick a game, then a character. An unfinished game is listed so it can be resumed.
function Play() {
  const characters = useCharacters((s) => s.characters)
  const loadCharacters = useCharacters((s) => s.load)
  const { games, load, start } = useGames()
  const [kind, setKind] = useState<GameKind>('goFish')
  const navigate = useNavigate()

  useEffect(() => {
    loadCharacters()
    load()
  }, [loadCharacters, load])

  const inProgress = games.filter((g) => g.status === 'playing')

  const items = useMemo(
    () =>
      characters.map((c) => ({
        key: String(c.id),
        label: displayName(c),
        avatar: c.avatar,
        avatarCrop: c.avatarCrop,
      })),
    [characters],
  )

  return (
    <div className="gamesPage">
      <h2 className="gamesHeading">Games</h2>
      <div className="gamesKindRow">
        {(Object.keys(gameLabels) as GameKind[]).map((id) => (
          <button
            key={id}
            type="button"
            className={`gamesKindButton${kind === id ? ' gamesKindButtonOn' : ''}`}
            onClick={() => setKind(id)}
          >
            {gameLabels[id]}
          </button>
        ))}
      </div>
      <p className="gamesHint">Pick a character to play against.</p>
      <EntityPicker
        items={items}
        placeholder="Search characters"
        emptyText="No characters yet."
        rows={6}
        onPick={async (item) => {
          const id = await start(kind, Number(item.key))
          if (id) navigate(`/games/${id}`)
        }}
      />

      {inProgress.length > 0 && (
        <div className="gamesSection">
          <h3 className="gamesSubheading">In progress</h3>
          <ul className="gamesList">
            {inProgress.map((game) => (
              <li key={game.id} className="gamesRow">
                <button type="button" className="gamesRowButton" onClick={() => navigate(`/games/${game.id}`)}>
                  {game.characterName}
                </button>
                <span className="gamesRowMeta">
                  {gameLabels[game.kind]} · {scoreLine(game)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Your score against theirs: books in Go Fish, rounds in Blackjack. */
function scoreLine(game: Game): string {
  const state = boardState(game)
  return 'books' in state
    ? `${state.books.player.length} - ${state.books.char.length}`
    : `${state.score.player} - ${state.score.char}`
}

/** Who took the game, or null for a tie. Both states carry the same idea under different names. */
function gameWinner(state: AnyGameState): 'player' | 'char' | null {
  const mine = 'books' in state ? state.books.player.length : state.score.player
  const theirs = 'books' in state ? state.books.char.length : state.score.char
  if (mine === theirs) return null
  return mine > theirs ? 'player' : 'char'
}

// Finished and abandoned games, replayed turn by turn with a scrubber.
function History() {
  const { games, load, remove } = useGames()
  const [openId, setOpenId] = useState<number | null>(null)

  useEffect(() => {
    load()
  }, [load])

  const past = games.filter((g) => g.status !== 'playing')
  const open = past.find((g) => g.id === openId)

  return (
    <div className="gamesPage">
      <h2 className="gamesHeading">History</h2>
      {past.length === 0 && <p className="gamesHint">No finished games.</p>}
      <ul className="gamesList">
        {past.map((game) => (
          <li key={game.id} className="gamesRow">
            <button
              type="button"
              className="gamesRowButton"
              onClick={() => setOpenId(game.id === openId ? null : game.id!)}
            >
              {game.characterName}
            </button>
            <span className="gamesRowMeta">
              {gameLabels[game.kind]} · {game.status === 'abandoned' ? 'Abandoned' : scoreLine(game)}
            </span>
            <button type="button" className="gamesRowRemove" onClick={() => remove(game.id!)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
      {open && <Replay key={open.id} game={open} />}
    </div>
  )
}

function Replay({ game }: { game: Game }) {
  const [upTo, setUpTo] = useState(game.events.length)
  const { boardScale, logOpen, logWidth, setLogOpen } = useGames()
  const characters = useCharacters((s) => s.characters)
  const personas = usePersonas((s) => s.personas)
  const character = characters.find((c) => c.id === game.characterId)
  const persona = personas.find((p) => p.id === game.personaId)
  const state = boardState(game, upTo)
  const events = game.events.slice(0, upTo)
  const lastSay = [...events].reverse().find((e) => e.kind === 'say')
  const phone = useMediaQuery('(max-width: 700px)')
  const drawer = useSideDrawer({ side: 'right', enabled: phone, open: logOpen, setOpen: setLogOpen })

  return (
    <div className="gamesReplay">
      <input
        className="gamesScrubber"
        type="range"
        min={0}
        max={game.events.length}
        value={upTo}
        onChange={(e) => setUpTo(Number(e.target.value))}
      />
      <span className="gamesRowMeta">
        Turn {upTo} of {game.events.length}
        {state.over
          ? ` · ${gameWinner(state) === 'player' ? 'you won' : gameWinner(state) === 'char' ? `${game.characterName} won` : 'a tie'}`
          : ''}
      </span>
      <div className="gamesTable">
        <GameBoard
          kind={game.kind}
          seed={game.seed}
          readOnly
          state={state}
          scale={boardScale}
          character={character}
          characterName={game.characterName}
          persona={persona}
          personaName={game.personaName ?? 'You'}
          line={lastSay?.kind === 'say' ? lastSay.text : ''}
          streaming={false}
        />
        <GameLog
          kind={game.kind}
          events={events}
          characterName={game.characterName}
          open={logOpen}
          width={logWidth}
          onToggle={() => setLogOpen(!logOpen)}
          phone={phone}
          drawerClassName={drawer.className}
          drawerStyle={drawer.style}
        />
      </div>
    </div>
  )
}

function LiveGame() {
  const { gameId } = useParams()
  const {
    game, state, streaming, streamingText, error, notice, open, close, submit, clearNotice,
    boardScale, logOpen, logWidth, setLogOpen, awaitingNext, next,
  } = useGames()
  const chatBack = useSettings((s) => s.gameChatBack)
  const autoSend = useSettings((s) => s.gameAutoSend)
  const characters = useCharacters((s) => s.characters)
  const loadCharacters = useCharacters((s) => s.load)
  const personas = usePersonas((s) => s.personas)
  const phone = useMediaQuery('(max-width: 700px)')
  const drawer = useSideDrawer({ side: 'right', enabled: phone, open: logOpen, setOpen: setLogOpen })

  useEffect(() => {
    loadCharacters()
    if (gameId) open(Number(gameId))
    return close
  }, [gameId, open, close, loadCharacters])

  // The notice is transient: it says the last thing typed was not a move, and it stops mattering
  // as soon as the player has read it.
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(clearNotice, 4000)
    return () => clearTimeout(timer)
  }, [notice, clearNotice])

  if (!game) return <div className="gamesPage" />

  const character = characters.find((c) => c.id === game.characterId)
  const persona = personas.find((p) => p.id === game.personaId)
  const lastSay = [...game.events].reverse().find((e) => e.kind === 'say')

  return (
    <div className="gamesPage screenFrame gamesLive">
      {/* No back button here: the rail's "Go back" is the way out, the same as a chat or a story. */}
      <div className="gamesTable">
        <GameBoard
          kind={game.kind}
          seed={game.seed}
          state={state}
          scale={boardScale}
          character={character}
          characterName={game.characterName}
          persona={persona}
          personaName={game.personaName ?? 'You'}
          line={streaming ? streamingText : lastSay?.kind === 'say' ? lastSay.text : ''}
          streaming={streaming}
          chatBack={chatBack}
          autoSend={autoSend}
          error={error}
          notice={notice}
          awaitingNext={awaitingNext}
          onSubmit={submit}
          onNext={next}
        />
        <GameLog
          kind={game.kind}
          events={game.events}
          characterName={game.characterName}
          streamingText={streaming ? streamingText : ''}
          open={logOpen}
          width={logWidth}
          onToggle={() => setLogOpen(!logOpen)}
          phone={phone}
          drawerClassName={drawer.className}
          drawerStyle={drawer.style}
        />
      </div>
    </div>
  )
}
