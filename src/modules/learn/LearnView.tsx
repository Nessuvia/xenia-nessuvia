import {
  FigLayers,
  FigLifetime,
  FigRegistry,
  FigStateToScreen,
  FigThreeStates,
} from './Figures'
import './learn.css'

// the article is JSX, not markdown. No renderer dependency, no fetch, no build step.
// A second long-form page is the cue to add a markdown pipeline.
function Code({ children }: { children: string }) {
  return (
    <pre className="learnCode">
      <code>{children}</code>
    </pre>
  )
}

/** The rule, up front, before any reasoning. */
function Rule({ children }: { children: React.ReactNode }) {
  return <p className="learnRule">{children}</p>
}

/** Folded mechanism. Every Rule that has a non-obvious reason gets one of these under it. */
function Why({ children }: { children: React.ReactNode }) {
  return (
    <details className="learnWhy">
      <summary>Explanation</summary>
      {children}
    </details>
  )
}

/** Code that looks correct and breaks, beside the fix. */
function Fix({
  what,
  wrong,
  right,
  note,
}: {
  what: string
  wrong: string
  right: string
  note?: string
}) {
  return (
    <section className="learnFix">
      <h3 className="learnFixWhat">{what}</h3>
      <div className="cmpPair">
        <div>
          <div className="cmpSide cmpSide-bad">Broken</div>
          <pre className="learnCode">
            <code>{wrong}</code>
          </pre>
        </div>
        <div>
          <div className="cmpSide">Fixed</div>
          <pre className="learnCode">
            <code>{right}</code>
          </pre>
        </div>
      </div>
      {note && <p className="cmpNote">{note}</p>}
    </section>
  )
}

const sameJob = [
  {
    what: 'Define a route',
    old: `# urls.py
urlpatterns = [
    path('chat/', views.chatIndex, name='chatIndex'),
    path('chat/<int:chatId>/', views.chatView, name='chatView'),
]`,
    now: `<Routes>
  <Route index element={<CharacterPicker />} />
  <Route path=":chatId" element={<ChatView />} />
</Routes>`,
  },
  {
    what: 'Read a URL param',
    old: `def chatView(request, chatId):
    ...`,
    now: `const { chatId } = useParams()`,
  },
  {
    what: 'Link to another page',
    old: `<a href="{% url 'chatView' chat.id %}">Open</a>`,
    now: `<Link to={\`/chat/\${chat.id}\`}>Open</Link>`,
    note: 'An <a> would reload the bundle and wipe every store.',
  },
  {
    what: 'Redirect after saving',
    old: `def save(request):
    ...
    return redirect('chatView', chatId=chat.id)`,
    now: `const navigate = useNavigate()

const id = await save(character)
navigate(\`/chat/c/\${id}\`)`,
  },
  {
    what: 'Load data for a screen',
    old: `def chatView(request, chatId):
    rows = sprocJsonList("sub_Chat_Messages %s,%s", [systemId, chatId])
    return render(request, 'chat.html', {'rows': rows})`,
    now: `const messages = useChats((s) => s.messages)
const load = useChats((s) => s.load)

useEffect(() => {
  load(chatId)
}, [chatId, load])`,
    note: 'The view had rows before it rendered. Here the first render has none and the effect fills them in.',
  },
  {
    what: 'Loop in the template',
    old: `{% for c in characters %}
  <li>{{ c.name }}</li>
{% endfor %}`,
    now: `{characters.map((c) => (
  <li key={c.id}>{c.name}</li>
))}`,
    note: 'Plain JS, and every item needs a stable key.',
  },
  {
    what: 'Show something conditionally',
    old: `{% if error %}
  <p class="error">{{ error }}</p>
{% endif %}`,
    now: `{error && <p className="error">{error}</p>}`,
  },
  {
    what: 'Call the data layer',
    old: `rows = sprocJsonList("sub_Memos_List %s", [systemId])`,
    now: `const rows = await storage.getAll('characters')`,
    note: 'Both are the one sanctioned way in. Neither belongs in the thing that renders.',
  },
  {
    what: 'Keep a value between interactions',
    old: `request.session['lastChatId'] = chatId`,
    now: `useChats.setState({ lastChatId: chatId })`,
    note: 'The store is memory. It is gone on refresh. Use storage for anything that must survive.',
  },
  {
    what: 'Carry a value to the next step of a form',
    old: `<input type="hidden" name="characterId" value="{{ id }}">`,
    now: `const [draft, setDraft] = useState({ characterId: id })`,
    note: 'There is no next request to carry it to. One object in state holds every step.',
  },
  {
    what: 'Add a column to a table',
    old: `// DataTables config + <th> + the row template
{ data: 'lastSeen', title: 'Last seen' }`,
    now: `<td>{formatStamp(c.lastSeen)}</td>`,
    note: 'One place: the markup for a row is a loop over your own array.',
  },
]

/** jQuery and vanilla habits, and what each one becomes. The centre column is why. */
const habits = [
  {
    old: `$('#count').text(n)`,
    breaks: 'Overwritten on the next render',
    now: `setCount(n)`,
  },
  {
    old: `$('#name').val()`,
    breaks: 'Reads the DOM, not your data',
    now: `the name variable, it already is the value`,
  },
  {
    old: `el.classList.toggle('open', isOpen)`,
    breaks: 'Overwritten on the next render',
    now: `className={isOpen ? 'panel open' : 'panel'}`,
  },
  {
    old: `$('#panel').hide()`,
    breaks: 'Overwritten on the next render',
    now: `{open && <Panel />}`,
  },
  {
    old: `$('#list').append(html)`,
    breaks: 'React removes it at the next diff',
    now: `setRows([...rows, row])`,
  },
  {
    old: `el.innerHTML = text`,
    breaks: 'Banned here, untrusted model output',
    now: `{text}, JSX escapes it`,
  },
  {
    old: `$('#save').on('click', fn)`,
    breaks: 'Nothing, but you never need it',
    now: `<button onClick={fn}>`,
  },
  {
    old: `$('#form').serialize()`,
    breaks: 'There is nothing to POST to',
    now: `the state object you already built`,
  },
  {
    old: `$.ajax({ url: '/api/…' })`,
    breaks: 'Wrong layer',
    now: `a store action calling storage or a connector`,
  },
  {
    old: `DataTable({ … })`,
    breaks: 'It owns DOM that React also owns',
    now: `.filter().sort().map()`,
  },
]

export default function LearnView() {
  return (
    <article className="learn screenFrame">
      <div className="screenBody">
        <h1>Learn this codebase</h1>
        <p className="learnLead">
          For someone who writes Django, jQuery and vanilla JS daily and has not written React.{' '}
          <code>src/resources/DevGuide.md</code> covers the procedures.
        </p>

        <h2 className="learnPart">Part one, read once</h2>
        <p className="learnPartNote">Each section assumes the one before it.</p>

        <h2>1. Building a screen, in your usual order</h2>
        <p>
          Usually, you build a list screen in a fixed order: write the template, add the{' '}
          <code>urls.py</code> line, write a stub view that just renders it, work out the sproc,
          transform the rows, pass them in as context, then put a search bar over the container.
          That order survives the move almost intact, with one step dropping out and one changing
          shape.
        </p>
        <table className="learnTable">
          <thead>
            <tr>
              <th>Other</th>
              <th>Here</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>New <code>Characters.html</code></td>
              <td>New <code>CharacterPicker.tsx</code> returning static JSX</td>
            </tr>
            <tr>
              <td><code>urls.py</code> line</td>
              <td><code>registerModule({'{…}'})</code> in the module's <code>index.tsx</code></td>
            </tr>
            <tr>
              <td>Stub view that renders the template</td>
              <td>Gone. The component is both.</td>
            </tr>
            <tr>
              <td>Sproc, then transform the rows</td>
              <td>A store action calling <code>storage</code></td>
            </tr>
            <tr>
              <td>Context dict → template</td>
              <td><code>useCharacters((s) =&gt; s.characters)</code> in the component</td>
            </tr>
            <tr>
              <td>Container, then a search bar over it</td>
              <td><code>.filter()</code> before <code>.map()</code></td>
            </tr>
          </tbody>
        </table>
        <p>
          <code>src/modules/chat/CharacterPicker.tsx</code> is that screen, built in that order, and
          the rest of this section goes through it a step at a time.
        </p>

        <h3>Steps 1 and 2, the file and the route</h3>
        <Code>{`// src/modules/chat/CharacterPicker.tsx
export default function CharacterPicker() {
  return <div className="chatPicker"><h2>Characters</h2></div>
}`}</Code>
        <p>
          That file runs as it stands. It is the stub template and the stub view at once: there
          is no server to hand markup to. The route comes next, and in this repo it lives in
          the module's own <code>index.tsx</code> rather than a central file:
        </p>
        <Code>{`// src/modules/chat/index.tsx
registerModule({ id: 'chat', label: 'Chat', icon: RiChat3Line, route: '/chat', component: ChatModule })`}</Code>
        <FigRegistry />
        <p>
          That one call produces both the sidebar link and the router entry. There is no{' '}
          <code>urls.py</code> to edit and no list of screens to keep current. Adding a screen
          means adding a folder and one import line in <code>main.tsx</code>.
        </p>

        <h3>Steps 3 and 4, the data</h3>
        <p>
          The sproc's job splits in two here. Reading rows belongs to <code>core/storage</code>,
          which is this repo's <code>db_utils.py</code>: the one sanctioned way to reach data.
          Holding the rows and deciding when to load them belongs to a store, which is the surviving
          half of a view.
        </p>
        <Code>{`// src/core/stores/charactersStore.ts, roughly
load: async () => {
  set({ loading: true })
  set({ characters: await storage.getAll('characters'), loading: false })
}`}</Code>
        <p>
          The component asks for the slice it needs and triggers the load once, when it first
          appears:
        </p>
        <Code>{`const { characters, loading, load } = useCharacters()

useEffect(() => {
  load()
}, [load])`}</Code>
        <p>
          This is the one step with no Django counterpart. Your view had rows <em>before</em> the
          template ran, whereas this component renders immediately with{' '}
          <code>characters === []</code> and rerenders once the read resolves, which is what §5 is
          about.
        </p>

        <h3>Step 5, render the rows</h3>
        <Code>{`{characters.map((c) => (
  <button key={c.id} className="pickerCard" onClick={() => navigate(\`/chat/c/\${c.id}\`)}>
    {displayName(c)}
  </button>
))}`}</Code>
        <p>
          The <code>{'{% for %}'}</code> became <code>.map()</code>, and the click handler is right
          there in the markup instead of in a separate <code>.js</code> file keyed off an id. That
          is the biggest day-to-day change to how a file reads: markup and behaviour stopped living
          in different folders.
        </p>

        <h3>Step 6, the search bar</h3>
        <p>
          Usually this is a DataTables call, or an input with a <code>keyup</code> handler that
          walks the rows and hides the ones that don't match. Here it comes to two pieces of
          ordinary JS. The first is a value held in state:
        </p>
        <Code>{`const [search, setSearch] = useState('')

<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search characters..." />`}</Code>
        <p>
          The second is an array filtered by that value, worked out during render rather than
          stored anywhere:
        </p>
        <Code>{`const q = search.trim().toLowerCase()
const shown = characters.filter((c) => !q || displayName(c).toLowerCase().includes(q))`}</Code>
        <p>
          Then <code>shown.map(…)</code> instead of <code>characters.map(…)</code>, and no code
          anywhere hides a row or walks the DOM. Typing sets <code>search</code>, which reruns the
          function, which produces a shorter list, which React diffs against what is currently on
          screen.
        </p>
        <FigStateToScreen />
        <Rule>
          Anything you can compute from state, compute during render. Do not put it in state and
          keep it in sync.
        </Rule>
        <Why>
          <p>
            <code>shown</code> is derived: given <code>characters</code> and <code>search</code>{' '}
            there is exactly one correct value for it. Storing it in its own{' '}
            <code>useState</code> creates a second source of truth that can disagree with the first,
            and then you are writing the sync code by hand: an effect that watches{' '}
            <code>search</code> and calls <code>setShown</code>. That effect runs a render late.
            For one frame the list on screen doesn't match the box. Computing it during render makes
            the mismatch unrepresentable.
          </p>
        </Why>

        <h2>2. The DOM is not yours anymore</h2>
        <p>
          Most of this page renames something you already do. This section removes a tool you use
          constantly, and it comes early for that reason.
        </p>
        <Rule>
          Never change a node React rendered. No <code>.text()</code>, no{' '}
          <code>.val()</code>, no <code>.addClass()</code>, no <code>.append()</code>, no{' '}
          <code>innerHTML</code>. Change state instead and let the component redraw.
        </Rule>
        <Why>
          <p>
            React keeps its own record of what it last put on screen. When state changes it re-runs
            your component, compares the new markup to that record, and applies the difference. It
            never reads the live document to find out what is there.
          </p>
          <p>
            A change you made with jQuery is invisible to it. The record still says the old text.
            The next render compares new markup against that stale record, decides that node is
            already correct or needs a different edit, and your change is gone. Touching the DOM
            is not forbidden on principle. React will silently undo it at an unpredictable time,
            worse than an error.
          </p>
        </Why>
        <table className="learnTable">
          <thead>
            <tr>
              <th>You would write</th>
              <th>What goes wrong</th>
              <th>Instead</th>
            </tr>
          </thead>
          <tbody>
            {habits.map((h) => (
              <tr key={h.old}>
                <td>
                  <code>{h.old}</code>
                </td>
                <td>{h.breaks}</td>
                <td>
                  <code>{h.now}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          The middle column repeats: most of these rows are the same failure arriving by
          different routes.
        </p>
        <Fix
          what="Clearing a form after save"
          wrong={`async function save() {
  await saveMemo({ title })
  document.querySelector('#title').value = ''
}`}
          right={`async function save() {
  await saveMemo({ title })
  setTitle('')
}`}
          note="The first one looks like it works, and does, until any unrelated state change rerenders the component and the old title reappears in the box."
        />
        <p>
          There is an escape hatch: <code>useRef</code> hands you the real node, for focusing an
          input, measuring a size, or driving a <code>&lt;canvas&gt;</code>. It exists for the cases
          where the browser API itself is the point, rather than as a way around state.
        </p>

        <h2>3. State, and the four rules around it</h2>
        <Code>{`const [text, setText] = useState('')`}</Code>
        <p>
          <code>text</code> is a plain string, fixed for the duration of this call.{' '}
          <code>setText</code> does not change it, it hands React a new value and asks for another
          run of the function, and on that run <code>text</code> comes back different.
        </p>

        <Rule>1. If state didn't change, the screen didn't change.</Rule>
        <Why>
          <p>
            A rerender only happens on one of three triggers: <code>set…</code> was called, a store
            slice you selected changed, or a parent rerendered. Assigning to an ordinary variable
            triggers none of those.
            The function already returned; the variable is gone; React was never told.
          </p>
        </Why>

        <Rule>
          2. Never mutate. <code>arr.push(x)</code> does nothing visible, write{' '}
          <code>setArr([...arr, x])</code>.
        </Rule>
        <Why>
          <p>
            React decides whether a value changed with <code>Object.is</code>, a reference
            comparison. <code>push</code> leaves the same array object in place. The old and new
            values are identical and the rerender is skipped. Same for{' '}
            <code>obj.name = 'x'</code>; write <code>setObj({'{ ...obj, name: \'x\' }'})</code>.
          </p>
        </Why>

        <Rule>3. Reading state right after setting it gives you the old value.</Rule>
        <Why>
          <p>
            <code>setText</code> schedules. It returns immediately and React runs the component
            again after your handler finishes: three <code>set</code> calls in one
            handler produce one rerender rather than three. You are still inside the render that had
            the old value. That is what you see. If you need the new value in the same handler,
            use the local variable you passed in.
          </p>
        </Why>
        <Fix
          what="Using a value you just set"
          wrong={`function onSubmit() {
  setTitle(input)
  saveMemo({ title })  // the old title
}`}
          right={`function onSubmit() {
  setTitle(input)
  saveMemo({ title: input })
}`}
        />

        <Rule>4. Inputs are controlled: state is the value, the input only displays it.</Rule>
        <Code>{`<input value={text} onChange={(e) => setText(e.target.value)} />`}</Code>
        <Why>
          <p>
            You never call <code>.val()</code>. There is nothing to ask. The box shows{' '}
            <code>text</code>, and every keystroke calls <code>setText</code>. The two can't
            drift. Validation gets shorter for the same reason: the value you would validate is already
            a variable in scope, not something you have to go and collect from five inputs at submit
            time.
          </p>
        </Why>

        <h3>What a hook is</h3>
        <p>
          A hook is a function starting with <code>use</code> that lets a component keep something
          across renders. Your component runs top to bottom every time and has no memory of its own.
          A hook is how it reaches a box React holds on the side for this particular instance.
        </p>
        <Rule>
          Call hooks at the top level of a component, unconditionally. Never inside an{' '}
          <code>if</code>, a loop, or after an early <code>return</code>.
        </Rule>
        <Why>
          <p>
            React tracks those boxes by call order, not by name: the first <code>useState</code> in
            the function gets box 1, the second gets box 2. Put one behind a condition and the
            numbering shifts on the render where the condition flips. Box 2's value arrives in
            box 1 and your draft text turns up in the wrong variable. The rule exists to keep the
            count identical on every render.
          </p>
        </Why>

        <h2>4. Lists, filters, and what replaces DataTables</h2>
        <p>
          DataTables is your default for anything with rows, and it is also the sharpest collision
          with React: it takes a <code>&lt;table&gt;</code> and rewrites it, adding a header, a
          pager, and its own copies of your rows, which leaves two systems that both believe they
          own those nodes. React's rerenders wipe DataTables' work, and DataTables' mutations get
          undone at the next diff.
        </p>
        <Rule>Sort, filter and page with array methods during render. Add a table library only if you need one, and then only one that renders through React.</Rule>
        <Why>
          <p>
            The reason DataTables was worth the dependency is that it did the DOM work, building
            rows, hiding them on search, reordering them on a header click. That is the exact work
            React already does. What is left is deciding which records to show and in what order,
            which is three array methods over data you already have in memory.
          </p>
        </Why>
        <Code>{`const q = search.trim().toLowerCase()
const shown = [...characters]
  .filter((c) => !q || displayName(c).toLowerCase().includes(q))
  .sort((a, b) => a.name.localeCompare(b.name))

{shown.map((c) => <Row key={c.id} character={c} />)}`}</Code>
        <p>
          Sorting by a clicked column is one more piece of state (<code>sortKey</code>) read by the
          comparator. Paging is <code>.slice(page * 50, page * 50 + 50)</code>. Export is a function
          over <code>shown</code>, and it exports exactly what is on screen: the same array
          produced both.
        </p>
        <p>
          The <code>[...characters]</code> copy matters. <code>.sort()</code> mutates in
          place and <code>characters</code> is state.
        </p>
        <Rule>
          Every item in a <code>.map()</code> needs a <code>key</code>, and it must be the record's
          id.
        </Rule>
        <Why>
          <p>
            <code>{'{% for %}'}</code> ran once and the HTML was final. React renders the same list
            over and over and has to answer each time: is this the same five rows with one name
            edited, or five different rows? <code>key</code> is the answer. Same key means same
            row. React keeps that DOM node and patches what differs.
          </p>
          <p>
            With the array index instead, deleting row 2 renumbers everything below it. React sees
            "row 3 is still row 3", leaves it alone, and scroll position, focus, and any state
            inside the row stay attached to the wrong record.
          </p>
        </Why>

        <h2>5. Loading data: three states, not two</h2>
        <FigThreeStates />
        <p>
          Django queried and <em>then</em> rendered: a template could assume its context was
          populated. Every read here is async and there is no moment before the first render to put
          one in. A screen that shows data has three cases, and two of them look identical in the
          data.
        </p>
        <Rule>
          Check <code>loading</code> before checking <code>length === 0</code>. An empty array means
          "we haven't looked yet" until the read finishes.
        </Rule>
        <Code>{`{loading && characters.length === 0 && <p>Loading…</p>}
{!loading && characters.length === 0 && <p>No characters yet, import or create one first.</p>}
{shown.map(…)}`}</Code>
        <Why>
          <p>
            Get the order wrong and the empty-state message flashes on every page load before the
            real list arrives: for the first frame the store genuinely holds{' '}
            <code>[]</code>. It only shows up on a slow read, and that is how it tends to get past
            review.
          </p>
        </Why>

        <h2>6. Effects, and why most code is not one</h2>
        <p>
          Rendering has one job: return markup for the current state. It must not do anything else
          no reads, no requests, no timers, no writing to anything outside the component. React may
          call your function more than once for a single visible update and throw the result away.
        </p>
        <p>An effect is where that other work goes: code React runs after the render is on screen.</p>
        <Code>{`useEffect(() => {
  const timer = setInterval(tick, 1000)
  return () => clearInterval(timer)   // cleanup, before the next run or on unmount
}, [chatId])`}</Code>
        <p>
          The dependency array answers "when should I run this again?" <code>[]</code> means once,
          when the component first appears, the usual spot for an initial load.{' '}
          <code>[chatId]</code> means now and again whenever <code>chatId</code> changes. Omitting
          the array means after every render, which is usually an infinite loop.
        </p>
        <Rule>
          Reach for an effect only to sync with something outside React: storage, the network, a
          timer, a subscription. Not to compute a value, and not to respond to a click.
        </Rule>
        <Why>
          <p>
            Two habits pull people here wrongly. The first is derived state (§1), an effect that
            watches one value and sets another, when a plain <code>const</code> during render would
            do. The second is treating an effect as an event handler: setting a flag in{' '}
            <code>onClick</code> and putting the real work in an effect that watches the flag. The
            work belongs in the handler. The user clicked; that is the event; there is nothing to
            wait for.
          </p>
          <p>
            The returned function is cleanup, which has no Django counterpart at all: a view had
            nothing to tear down. The process ended. Here a component can be removed
            while its request is still in flight. React deliberately mounts every component twice in
            development, and effects run twice: the tool exposing a missing cleanup, not a bug to
            guard against.
          </p>
        </Why>

        <h2>7. Stores, sessions and hidden fields</h2>
        <FigLifetime />
        <Code>{`const characters = useCharacters((s) => s.characters)
const save = useCharacters((s) => s.save)`}</Code>
        <p>
          A Zustand store holds shared state and runs the async work, the data half of a view,
          kept in memory. The function you pass is a selector: it picks one slice, and the component
          rerenders only when that slice changes. Selecting the whole store means rerendering on
          every unrelated change.
        </p>
        <p>
          <code>request.session</code> becomes a store, with the difference that a store is memory
          and dies on refresh unless it was written to IndexedDB via <code>core/storage</code>, or
          to localStorage for small settings. The <strong>hidden field</strong> has no equivalent at
          all: there is no next request to smuggle a value into. A multi-step form becomes
          one draft object held in state or a store for the whole flow, with every step reading and
          writing it.
        </p>
        <Rule>
          Put a value at the narrowest scope that works: one component's <code>useState</code>,
          then a store, then storage. Move it up only when something outside actually needs it.
        </Rule>

        <h2>8. Routing</h2>
        <p>
          React Router keeps <code>urls.py</code>'s pattern list and throws away everything else. It
          reads the URL out of the address bar, matches it, and swaps a component into the page that
          is already open. No request: stores, open streams and scroll position survive.
        </p>
        <Rule>
          Never use <code>&lt;a href&gt;</code> for an internal link. <code>&lt;Link to&gt;</code>{' '}
          swaps a component; an anchor reloads the bundle and wipes every store.
        </Rule>
        <Rule>
          Put something in the URL when it should survive refresh, be linkable, or answer to the
          back button. Which chat is open, yes. Whether a panel is collapsed, no.
        </Rule>
        <Why>
          <p>
            In Django the URL was the only input the server got. Everything had to be in it.
            Here most state lives in components and stores, and putting something in the URL is a
            deliberate choice to publish it. The cost is that it becomes an interface, bookmarkable
            and back-buttonable, which is exactly what you want for a chat id and not for a
            chevron.
          </p>
        </Why>

        <h2>9. The layer rule</h2>
        <FigLayers />
        <Code>{`components  →  stores  →  storage / connectors
(modules/)     (core/stores)   (core/storage, core/connectors)`}</Code>
        <p>Each layer talks only to the one below it, and nothing talks upward.</p>
        <ul>
          <li>
            <strong>Components</strong> render state and call store actions. They never import Dexie
            and never call <code>fetch</code>.
          </li>
          <li>
            <strong>Stores</strong> hold state, run the async work, and are the only callers of
            storage and connectors.
          </li>
          <li>
            <strong><code>core/storage</code></strong> is the only file that imports Dexie.{' '}
            <strong><code>core/connectors</code></strong> is the only file that calls{' '}
            <code>fetch</code>.
          </li>
        </ul>
        <p>
          You already enforce this under other names. Raw SQL in a template is obviously wrong:
          queries stay in the view. A sproc call scattered across five views is wrong: it lives
          behind <code>db_utils.py</code>. Django doesn't enforce any of that either, the imports
          would work. It holds on agreement: everyone agrees where things go. Same here: nothing stops you
          importing <code>db</code> into a component, and it is a review rule, not an error.
        </p>

        <h2>10. When it breaks</h2>
        <p>
          Your ladder elsewhere is fixed: IIS catches the 500, the Django log says what blew up,
          you read the view, then you check whether the sproc failed quietly, then you look at
          whether the template used the data or the JS went and fetched it itself. The same ladder
          applies here, except that the whole stack is in one process. There is no server log to
          start from and the rungs sit closer together.
        </p>
        <ol>
          <li>
            <strong>The overlay and the console.</strong> A thrown error in a render puts a stack
            trace on the page in dev. This is the error log, and it is the only rung that tells you
            the answer outright.
          </li>
          <li>
            <strong>Is the state right?</strong> React DevTools, select the component, read its
            hooks and the store. This is "debug the view" and it settles most bugs: if the
            state is right and the screen is wrong the problem is below you, and if the state is
            wrong it is above.
          </li>
          <li>
            <strong>Did the write land?</strong> DevTools → Application → IndexedDB is SSMS. If the
            row is there and the screen is stale, the store never reloaded.
          </li>
          <li>
            <strong>Is the component reading it?</strong> A selector pointing at a field that no
            longer exists returns <code>undefined</code> quietly. So does a stale closure in an
            effect with a missing dependency.
          </li>
          <li>
            <strong>Is it rendering it?</strong> A condition hiding the branch, a filter that
            matched nothing, a <code>loading</code> flag stuck true.
          </li>
        </ol>
        <Rule>
          Your "sproc failing silently" is an unhandled promise rejection. A store action that{' '}
          <code>await</code>s without <code>try</code>/<code>catch</code> leaves the screen frozen
          on the loading state with nothing in the console but a warning.
        </Rule>
        <p>
          The two failures with no analogue: a rerender that never fired, state
          mutated in place (§3), and a change you made to the DOM that React reverted (§2). Both
          present as the code running with the screen not moving. That could not happen in Django:
          the screen was the response.
        </p>

        <h2 className="learnPart">Part two, look it up</h2>
        <p className="learnPartNote">
          For scanning mid-task, find the row that matches whatever you are stuck on.
        </p>

        <h2>Every rule in one list</h2>
        <ol>
          <li>Never change a node React rendered. Change state (§2).</li>
          <li>If state didn't change, the screen didn't change (§3).</li>
          <li>Never mutate, spread into a new array or object (§3).</li>
          <li>Reading state right after setting it gives the old value (§3).</li>
          <li>Inputs are controlled: state is the value (§3).</li>
          <li>Hooks at the top level, unconditionally, same order every render (§3).</li>
          <li>Compute derived values during render, never in state (§1).</li>
          <li>
            Every <code>.map()</code> item needs a <code>key</code>, and it is the record's id (§4).
          </li>
          <li>
            Check <code>loading</code> before <code>length === 0</code> (§5).
          </li>
          <li>Effects are for syncing with the outside. Not computing, not click handling (§6).</li>
          <li>
            <code>&lt;Link&gt;</code> for internal links, never <code>&lt;a href&gt;</code> (§8).
          </li>
          <li>Components never import Dexie and never call <code>fetch</code> (§9).</li>
        </ol>

        <h2>Same job, both ways</h2>
        <div className="cmpList">
          {sameJob.map((row) => (
            <section className="cmp" key={row.what}>
              <h3 className="cmpWhat">{row.what}</h3>
              <div className="cmpPair">
                <div>
                  <div className="cmpSide">Other</div>
                  <pre className="learnCode">
                    <code>{row.old}</code>
                  </pre>
                </div>
                <div>
                  <div className="cmpSide">Here</div>
                  <pre className="learnCode">
                    <code>{row.now}</code>
                  </pre>
                </div>
              </div>
              {row.note && <p className="cmpNote">{row.note}</p>}
            </section>
          ))}
        </div>

        <h2>Phrasebook</h2>
        <table className="learnTable">
          <thead>
            <tr>
              <th>Other</th>
              <th>Here</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>urls.py</code> → view function</td>
              <td>Module registry + React Router</td>
            </tr>
            <tr>
              <td>Template rendered server-side</td>
              <td>Component re-run in the browser on every state change</td>
            </tr>
            <tr>
              <td>Context dict passed to a template</td>
              <td>Props</td>
            </tr>
            <tr>
              <td><code>views.py</code></td>
              <td>Split: markup to the component, data to a store</td>
            </tr>
            <tr>
              <td>Sproc via <code>db_utils.py</code></td>
              <td><code>storage.*</code> over Dexie</td>
            </tr>
            <tr>
              <td>MSSQL</td>
              <td>IndexedDB, in the user's browser</td>
            </tr>
            <tr>
              <td>SSMS</td>
              <td>DevTools → Application → IndexedDB</td>
            </tr>
            <tr>
              <td>Django error log</td>
              <td>The dev overlay and the console</td>
            </tr>
            <tr>
              <td><code>request.session</code></td>
              <td>Zustand store (memory) + localStorage</td>
            </tr>
            <tr>
              <td>Hidden field</td>
              <td>One draft object in state for the whole flow</td>
            </tr>
            <tr>
              <td>Form POST → redirect</td>
              <td>Handler → store action → state change</td>
            </tr>
            <tr>
              <td>DataTables</td>
              <td><code>.filter().sort().map()</code></td>
            </tr>
            <tr>
              <td><code>{'{% static %}'}</code> and <code>collectstatic</code></td>
              <td>An <code>import</code>; Vite bundles it</td>
            </tr>
            <tr>
              <td>Migrations</td>
              <td>A new <code>db.version(n).stores({'{…}'})</code>, and only for indexes</td>
            </tr>
            <tr>
              <td>Server-side secrets</td>
              <td>None. Everything is readable in DevTools.</td>
            </tr>
          </tbody>
        </table>

        <h2>Where files go</h2>
        <p>
          We usually split a module by <em>file type</em>: markup in <code>templates/</code>,
          behaviour in <code>static/js/</code>, modals in <code>lightbox/</code>, data access as a
          sproc name inside a view. Working on one screen means four folders open. Here a module is
          split by feature: the markup, the handlers and the styles for one screen sit together.
        </p>
        <div className="cmpPair">
          <div>
            <div className="cmpSide">Other</div>
            <pre className="learnCode">
              <code>{`home/
├── static/js/
│   └── training.js
├── templates/
│   ├── Training.html
│   └── Search.html
├── lightbox/
│   └── MyProgress.html
├── urls.py
└── views.py`}</code>
            </pre>
          </div>
          <div>
            <div className="cmpSide">Here</div>
            <pre className="learnCode">
              <code>{`src/
├── app/            shell, shared UI
├── core/           no UI in here
│   ├── storage/    Dexie only
│   ├── connectors/ fetch only
│   ├── stores/     shared state
│   └── prompt/     domain logic
├── modules/
│   └── chat/
│       ├── index.tsx      registers + routes
│       ├── ChatView.tsx
│       ├── renderText.ts
│       ├── checkRenderText.ts
│       └── chat.css
└── main.tsx        entry point`}</code>
            </pre>
          </div>
        </div>
        <ol>
          <li>
            <strong>Used by one screen?</strong> That module's folder. Default to this.
          </li>
          <li>
            <strong>Used by two?</strong> Leave the copy. On the third, move it to{' '}
            <code>app/</code> (shared UI) or <code>core/</code> (shared logic).
          </li>
          <li>
            <strong>Touches Dexie or <code>fetch</code>?</strong> <code>core/storage</code> or{' '}
            <code>core/connectors</code>, whatever else it is.
          </li>
          <li>
            <strong>A whole new screen?</strong> A folder under <code>modules/</code> with an{' '}
            <code>index.tsx</code>, and one import line in <code>main.tsx</code>.
          </li>
        </ol>
        <p>Conventions inside a module:</p>
        <ul>
          <li>
            One component per file, filename is the component name. PascalCase for components,
            camelCase for everything else, the only exception to the camelCase rule.
          </li>
          <li>
            <code>.tsx</code> if the file contains markup, <code>.ts</code> if it is plain logic.
          </li>
          <li>One <code>.css</code> per module, imported by it.</li>
          <li>
            A <code>check*.ts</code> sits beside what it tests, <code>renderText.ts</code> and{' '}
            <code>checkRenderText.ts</code>.
          </li>
          <li>
            Nothing outside <code>modules/chat</code> should import{' '}
            <code>modules/chat/ChatList</code>. If it wants to, that file belongs in{' '}
            <code>app/</code> or <code>core/</code>.
          </li>
        </ul>

        <h2>JSX gotchas</h2>
        <ul>
          <li>
            <code>class</code> is <code>className</code>, <code>for</code> is <code>htmlFor</code>.
          </li>
          <li>
            <code>style</code> takes an object with camelCased keys:{' '}
            <code>{'style={{ marginTop: 8 }}'}</code>.
          </li>
          <li>Every tag self-closes. A component returns one root, use <code>&lt;&gt;…&lt;/&gt;</code> for siblings.</li>
          <li>
            <code>{'{}'}</code> drops into JS. There is no <code>{'{% if %}'}</code>. Use{' '}
            <code>&amp;&amp;</code> and <code>?:</code>.
          </li>
          <li>
            <code>{'{count && <p>…</p>}'}</code> renders a bare <code>0</code> when count is zero.
            Write <code>{'count > 0 &&'}</code>.
          </li>
          <li>
            JSX escapes text. <code>dangerouslySetInnerHTML</code> is banned here:
            model output is untrusted and this origin holds API keys.
          </li>
        </ul>

        <h2>Next</h2>
        <p>
          Read <code>src/modules/chat/CharacterPicker.tsx</code>, the screen this page walked, end
          to end in one file. Then <code>src/modules/chat/ChatView.tsx</code> for the hard version.
          The full link list is at the bottom of <code>src/resources/DevGuide.md</code>; start with{' '}
          <a href="https://react.dev/learn" target="_blank" rel="noreferrer">
            react.dev Quick Start
          </a>
          .
        </p>
      </div>
    </article>
  )
}
