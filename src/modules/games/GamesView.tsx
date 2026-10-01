import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import EntityPicker from '../../app/EntityPicker'
import PageHeader from '../../app/PageHeader'
import PageTabs from '../../app/PageTabs'
import { useHashTab } from '../../app/useHashTab'
import { useMediaQuery } from '../../app/useMediaQuery'
import { useSideDrawer } from '../../app/useSideDrawer'
import { displayName, useCharacters } from '../../core/stores/charactersStore'
import { usePersonas } from '../../core/stores/personasStore'
import { useSettings } from '../../core/stores/settingsStore'
import type { GameKind } from '../../core/games/gameEvent'
import { gameLabels } from '../../core/games/gameEvent'
import type { AvatarSource, Game } from '../../core/storage/types'
import { boardState, useGames, type AnyGameState } from './gamesStore'
import GameBoard from './GameBoard'
import GameLog from './GameLog'
import { secretRanks } from '../../core/games/cardSpoilers'

import { tabs } from './tabs'
import { RiDeleteBinLine } from '@remixicon/react'
import { useCloseOnOutside } from '../../app/useCloseOnOutside'
import { Avatar } from '../../app/Avatar'
import { groupHistory, type GroupBy } from './historyGroups'
import { colorVars } from '../chat/MessageBubble'
import { usePalette } from '../../core/stores/palettesStore'
import { emptyColors, type Character } from '../../core/storage/types'
import type { Palette } from '../../core/palette/palette'

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
  const [tab, setTab] = useHashTab(tabs.map(([id]) => id))
  return (
    <div className="gamesPage screenFrame">
      <PageHeader title="Games">
        <PageTabs tabs={tabs} current={tab} onPick={setTab} />
      </PageHeader>
      <div className="gamesBody screenBody">{tab === 'history' ? <History /> : <Play />}</div>
    </div>
  )
}

// Setup: pick a game, then a character. An unfinished game is listed. It can be resumed.
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
    <>
      {/* Cards the size of a Story cover on the Write shelf, turned on their side. Art goes in
          the card later. Until then the name sits on a palette-tinted placeholder. */}
      <ul className="gamesShelf">
        {(Object.keys(gameLabels) as GameKind[]).map((id) => (
          <li key={id}>
            <button
              type="button"
              className={`gamesCard${kind === id ? ' gamesCardOn' : ''}`}
              aria-pressed={kind === id}
              onClick={() => setKind(id)}
            >
              <span className="gamesCardName">{gameLabels[id]}</span>
            </button>
          </li>
        ))}
      </ul>
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
    </>
  )
}

/** Your score against theirs: books in Go Fish, rounds in Blackjack. */
function scoreLine(game: Game): string {
  const state = boardState(game)
  return 'books' in state
    ? `${state.books.player.length} - ${state.books.char.length}`
    : `${state.score.player} - ${state.score.char}`
}

/** Deletes every abandoned game in two clicks: the first arms it and shows the count, the second
 *  deletes. A click anywhere else, or Escape, disarms it. */
function DeleteAbandoned() {
  const games = useGames((s) => s.games)
  const remove = useGames((s) => s.remove)
  const [primed, setPrimed] = useState(false)
  const ref = useCloseOnOutside<HTMLButtonElement>(primed, () => setPrimed(false))
  const abandoned = games.filter((g) => g.status === 'abandoned')
  const n = abandoned.length

  return (
    <button
      ref={ref}
      type="button"
      className="danger"
      disabled={n === 0}
      title={n === 0 ? 'No abandoned games.' : undefined}
      onClick={async () => {
        if (!primed) return setPrimed(true)
        setPrimed(false)
        for (const g of abandoned) await remove(g.id!)
      }}
    >
      <RiDeleteBinLine size={16} />
      {primed ? `Delete (${n}) Abandoned ${n === 1 ? 'Game' : 'Games'}?` : 'Delete Abandoned'}
    </button>
  )
}

/** The character's text colors for a game, layered the way a chat does it: the palette's chat color
 *  first, the character's own over it unless the palette overwrites character colors. Set on the
 *  game's root; the board's line and the log's character bubbles read --textColor and the markers'
 *  --quoteColor, --emphasisColor and --boldColor. A plain function,
 *  not a hook: LiveGame computes it after its early return, where a hook can't run. */
function characterText(character: Character | undefined, palette: Palette): CSSProperties {
  return {
    '--textColor': palette.textColor || '',
    '--emphasisColor': palette.emphasisColor || '',
    '--boldColor': palette.boldColor || '',
    '--quoteColor': palette.quoteColor || '',
    ...colorVars(character?.colors ?? emptyColors(), palette.overwriteCharColor),
  } as CSSProperties
}

/** Your score and theirs: books in Go Fish, rounds in Blackjack. */
function scores(state: AnyGameState): [number, number] {
  return 'books' in state
    ? [state.books.player.length, state.books.char.length]
    : [state.score.player, state.score.char]
}

/** Who took the game, or null for a tie. Both states carry the same idea under different names. */
function gameWinner(state: AnyGameState): 'player' | 'char' | null {
  const [mine, theirs] = scores(state)
  if (mine === theirs) return null
  return mine > theirs ? 'player' : 'char'
}

const groupings: [GroupBy, string][] = [
  ['date', 'Date'],
  ['character', 'Character'],
  ['game', 'Game'],
]

const played = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

// Finished and abandoned games, replayed turn by turn with a scrubber.
function History() {
  const { games, load, remove } = useGames()
  const characters = useCharacters((s) => s.characters)
  const loadCharacters = useCharacters((s) => s.load)
  const personas = usePersonas((s) => s.personas)
  const loadPersonas = usePersonas((s) => s.load)
  const [openId, setOpenId] = useState<number | null>(null)
  // Page view state, not saved: the history opens grouped by month.
  const [by, setBy] = useState<GroupBy>('date')

  useEffect(() => {
    load()
    loadCharacters()
    loadPersonas()
  }, [load, loadCharacters, loadPersonas])

  const past = games.filter((g) => g.status !== 'playing')
  const groups = groupHistory(
    past.map((g) => ({ game: g, characterName: g.characterName, gameLabel: gameLabels[g.kind], at: g.updatedAt })),
    by,
  )
  const open = past.find((g) => g.id === openId)

  return (
    <>
      {/* Under the tabs: how the cards are grouped on the left, the bulk delete on the right. */}
      <div className="gamesHistoryBar">
        <label className="gamesHistoryGroupBy">
          Group by
          <select value={by} onChange={(e) => setBy(e.target.value as GroupBy)}>
            {groupings.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <DeleteAbandoned />
      </div>

      {past.length === 0 && <p className="gamesHint">No finished games.</p>}

      {groups.map(({ label, games: inGroup }) => (
        <section key={label} className="gamesHistoryGroup">
          <h3 className="gamesHistoryGroupTitle">{label}</h3>
          <ul className="gamesShelf">
            {inGroup.map(({ game }) => (
              <li key={game.id} className="gamesHistoryItem">
                <HistoryCard
                  game={game}
                  you={personas.find((p) => p.id === game.personaId)}
                  them={characters.find((c) => c.id === game.characterId)}
                  open={game.id === openId}
                  onOpen={() => setOpenId(game.id === openId ? null : game.id!)}
                />
                {/* Outside the card's button: a button can't hold another. Shown on hover or focus. */}
                <button
                  type="button"
                  className="gamesCardRemove danger"
                  title="Delete"
                  aria-label={`Delete the game against ${game.characterName}`}
                  onClick={() => {
                    if (openId === game.id) setOpenId(null)
                    remove(game.id!)
                  }}
                >
                  <RiDeleteBinLine size={14} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {open && <Replay key={open.id} game={open} />}
    </>
  )
}

/** One past game: you and them facing each other, the result between, game and date along the
 *  bottom. Avatars come from the live persona and character, falling back to the saved name's
 *  initial when either has since been deleted. */
function HistoryCard({
  game,
  you,
  them,
  open,
  onOpen,
}: {
  game: Game
  you: AvatarSource | undefined
  them: AvatarSource | undefined
  open: boolean
  onOpen: () => void
}) {
  const abandoned = game.status === 'abandoned'
  const state = boardState(game)
  const [mine, theirs] = scores(state)
  const winner = gameWinner(state)
  const result = abandoned ? 'Abandoned' : winner === 'player' ? 'Win' : winner === 'char' ? 'Loss' : 'Draw'
  const tone = abandoned ? 'none' : winner === 'player' ? 'win' : winner === 'char' ? 'loss' : 'draw'

  return (
    <button
      type="button"
      className={`gamesCard gamesResultCard${open ? ' gamesCardOn' : ''}`}
      aria-pressed={open}
      onClick={onOpen}
    >
      <span className="gamesVs">
        <Avatar of={you} name={game.personaName ?? 'You'} className="avatar gamesVsAvatar" />
        <Avatar of={them} name={game.characterName} className="avatar gamesVsAvatar" />
      </span>
      <span className="gamesResultMid">
        <span className={`gamesResult ${tone}`}>{result}</span>
        {!abandoned && (
          <span className="gamesResultScore">
            {mine} to {theirs}
          </span>
        )}
      </span>
      <span className="gamesCardMeta">
        {gameLabels[game.kind]} · {played.format(game.updatedAt)}
      </span>
    </button>
  )
}

function Replay({ game }: { game: Game }) {
  const [upTo, setUpTo] = useState(game.events.length)
  const { boardScale, handFit, logOpen, logWidth, setLogOpen } = useGames()
  const characters = useCharacters((s) => s.characters)
  const personas = usePersonas((s) => s.personas)
  const palette = usePalette()
  const character = characters.find((c) => c.id === game.characterId)
  const charText = characterText(character, palette)
  const persona = personas.find((p) => p.id === game.personaId)
  const state = boardState(game, upTo)
  const events = game.events.slice(0, upTo)
  const lastSay = [...events].reverse().find((e) => e.kind === 'say' && e.by === 'char')
  const phone = useMediaQuery('(max-width: 700px)')
  const drawer = useSideDrawer({ side: 'right', enabled: phone, open: logOpen, setOpen: setLogOpen })

  return (
    <div className="gamesReplay" style={charText}>
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
          handFit={handFit}
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
          secret={secretRanks(state)}
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
    game, state, streaming, streamingText, error, notice, open, close, submit, chooseAce, clearNotice,
    boardScale, handFit, setHandFit, logOpen, logWidth, setLogOpen, awaitingNext, next,
  } = useGames()
  const chatBack = useSettings((s) => s.gameChatBack)
  const autoSend = useSettings((s) => s.gameAutoSend)
  const characters = useCharacters((s) => s.characters)
  const loadCharacters = useCharacters((s) => s.load)
  const personas = usePersonas((s) => s.personas)
  const phone = useMediaQuery('(max-width: 700px)')
  const palette = usePalette()
  const drawer = useSideDrawer({ side: 'right', enabled: phone, open: logOpen, setOpen: setLogOpen })

  useEffect(() => {
    loadCharacters()
    if (gameId) open(Number(gameId))
    return close
  }, [gameId, open, close, loadCharacters])

  // The notice is transient: it says the last thing typed wasn't a move, and it stops mattering
  // as soon as the player has read it.
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(clearNotice, 4000)
    return () => clearTimeout(timer)
  }, [notice, clearNotice])

  if (!game) return <div className="gamesPage" />

  const character = characters.find((c) => c.id === game.characterId)
  const charText = characterText(character, palette)
  const persona = personas.find((p) => p.id === game.personaId)
  // The character's last line, not the last line: the Hit and Stand buttons write yours.
  const lastSay = [...game.events].reverse().find((e) => e.kind === 'say' && e.by === 'char')

  return (
    <div className="gamesPage screenFrame gamesLive" style={charText}>
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
          handFit={handFit}
          onHandFit={setHandFit}
          error={error}
          notice={notice}
          awaitingNext={awaitingNext}
          onSubmit={submit}
          onChooseAce={chooseAce}
          onNext={next}
        />
        <GameLog
          kind={game.kind}
          events={game.events}
          characterName={game.characterName}
          streamingText={streaming ? streamingText : ''}
          secret={secretRanks(state)}
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
