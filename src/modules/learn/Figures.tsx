// diagrams are divs and CSS, no chart library and no SVG authoring. If one of these
// needs real geometry (curves, layout maths), that's the one to draw in SVG, not all of them.
//
// Two kinds only: the two that answered a question the prose couldn't.
//   - "where does code live"      → boxes and arrows (FigLayers, FigLifetime, FigRegistry)
//   - "what's on screen for this state" → a state value beside a mock screen (FigStateToScreen,
//     FigThreeStates). Sequence diagrams got cut; the code already reads in order.
function Fig({
  title,
  wide,
  children,
}: {
  title: string
  wide?: boolean
  children: React.ReactNode
}) {
  return (
    <figure className={`fig${wide ? ' figWide' : ''}`}>
      <figcaption className="figTitle">{title}</figcaption>
      {children}
    </figure>
  )
}

function Box({ children, tone }: { children: React.ReactNode; tone?: 'accent' | 'dim' }) {
  return <div className={`figBox${tone ? ` figBox-${tone}` : ''}`}>{children}</div>
}

function Down() {
  return <div className="figArrow">↓</div>
}

/** A tiny mock of the character grid, so a state value has something visible beside it. */
function Screen({ rows, message }: { rows?: string[]; message?: string }) {
  return (
    <div className="figScreen">
      <div className="figScreenBar">Characters</div>
      {message && <div className="figScreenMsg">{message}</div>}
      {rows?.map((row) => (
        <div className="figScreenRow" key={row}>
          {row}
        </div>
      ))}
    </div>
  )
}

/** Left column is state, right column is what's on screen. The point is that only the left changed. */
function Pair({ state, children }: { state: string; children: React.ReactNode }) {
  return (
    <div className="figPair">
      <code className="figState">{state}</code>
      <span className="figPairArrow">→</span>
      {children}
    </div>
  )
}

export function FigStateToScreen() {
  return (
    <Fig title="Same component, two state values" wide>
      <Pair state={`search = ''`}>
        <Screen rows={['Damien', 'Elias', 'Mira']} />
      </Pair>
      <Pair state={`search = 'da'`}>
        <Screen rows={['Damien']} />
      </Pair>
      <div className="figNote">
        Nothing ran against the list on screen; the value changed and React redrew from it.
      </div>
    </Fig>
  )
}

export function FigThreeStates() {
  return (
    <Fig title="Three states, not two" wide>
      <Pair state={`loading = true\ncharacters = []`}>
        <Screen message="Loading…" />
      </Pair>
      <Pair state={`loading = false\ncharacters = []`}>
        <Screen message="No characters yet" />
      </Pair>
      <Pair state={`loading = false\ncharacters = [3]`}>
        <Screen rows={['Damien', 'Elias', 'Mira']} />
      </Pair>
      <div className="figNote">
        The first two both have <code>characters.length === 0</code> and mean opposite things.
      </div>
    </Fig>
  )
}

export function FigLifetime() {
  return (
    <Fig title="What survives F5">
      <div className="figBar figBar-gone">
        <span>useState</span>
        <span className="figBarTag">gone</span>
      </div>
      <div className="figBar figBar-gone">
        <span>Zustand store</span>
        <span className="figBarTag">gone</span>
      </div>
      <div className="figRefresh">-- refresh --</div>
      <div className="figBar figBar-kept">
        <span>localStorage</span>
        <span className="figBarTag">kept</span>
      </div>
      <div className="figBar figBar-kept">
        <span>IndexedDB</span>
        <span className="figBarTag">kept</span>
      </div>
      <div className="figNote">Above the line is memory. MSSQL kept it for you; nothing does here.</div>
    </Fig>
  )
}

export function FigLayers() {
  return (
    <Fig title="One direction">
      <Box>components, modules/</Box>
      <Down />
      <Box>stores, core/stores</Box>
      <Down />
      <Box tone="accent">
        storage · connectors
        <div className="figSub">the only Dexie · the only fetch</div>
      </Box>
      <div className="figNote">Arrows never point back up.</div>
    </Fig>
  )
}

export function FigRegistry() {
  return (
    <Fig title="One call, two consumers">
      <Box tone="accent">registerModule({'{…}'})</Box>
      <div className="figFan">↙ ↘</div>
      <div className="figSplit">
        <Box>Sidebar link</Box>
        <Box>Router route</Box>
      </div>
      <div className="figNote">No central list of screens to edit.</div>
    </Fig>
  )
}
