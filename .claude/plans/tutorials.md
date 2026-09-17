# Tutorials plan

A guided walkthrough that drives the app rather than pointing at it. The first one takes a new user
from an empty Settings page to a working chat with Nessuvia, creating a real connection on the way.

Tours stay exactly as they are. This is a second, heavier system next to them.

## Decisions

| Question | Answer |
| --- | --- |
| Engine | New, in `core/tutorial`. `core/tour` is untouched. |
| Step format | Typed objects in `.ts` files, not markdown. Actions need predicates and selectors. |
| Overlay | Hoisted out of `Tour.tsx` and shared. One positioner, two callers. |
| Dummy backend | Sentinel URL `xenia.nessuvia.com/v1`, checked globally. Nothing is sent. |
| Reply | Always the same line, streamed as real SSE. |
| Records | Real connection, real chat. Duplicates on rerun are fine. |
| Gating | Hard. A gated step doesn't advance until the action happens. |
| Escape | One `Exit tutorial` button on every panel. No per-step skip. |
| Broken selector | Tutorial is stuck. `checkTutorial.ts` is what stops that shipping. |
| Navigation | The user clicks the sidebar. The step waits for the route. |
| Back | Never crosses a step that made a record. `act()` need not be idempotent. |
| Mobile | Compact docked box. Edge flips away from the target; `dock` overrides. |
| Soft keyboard | Box hides while it's up, returns when it drops. From `visualViewport`. |
| API key gate | Exactly `xenia`. The copy names the value, so the gate matches it. |
| Module | `tutorials`, sidebar row, list page with search, `tutorialsEnabled` boolean. |

## Why not extend the tour engine

A tour is a passive overlay: `parseTour` produces `{ target, side, only, body }`, `Tour.tsx` points
at a selector, and clicking anywhere advances. It never touches the app, never navigates, and skips
a step whose target is missing. Every one of those is inverted here. A tutorial writes records,
changes routes, types into fields, blocks on user input, and must not silently skip the step that
creates the connection.

Markdown is the wrong carrier for that. `## .apiKeyInput | waitForValue | xenia` is a config
language pretending to be prose, and the moment a step needs "wait until the route is `/chat`" it
stops fitting on a line. Typed objects say what they mean and the compiler checks the selectors'
neighbours.

What is shared is the hard part: `getBoundingClientRect`, side selection with collision
flipping, the 9999px cutout, the hand placement, the mobile dock. That comes out of `Tour.tsx` into
`app/SpotlightOverlay.tsx` and both engines render through it. `Tour.tsx` keeps its step loop and
loses about 80 lines of geometry.

## The sentinel connection

`xenia.nessuvia.com` is a string, not a host. A connection whose endpoint is that URL is answered
locally with one line:

> You're seeing this because your LLM connection is set to xenia.nessuvia.com. Add a real
> connection to chat.

Every reply, no rotation. A newcomer who sends three messages should get three identical answers:
the moment it varies it starts looking like a model.

It lives in `core/connectors/sentinel.ts`:

```ts
export const sentinelHost = 'xenia.nessuvia.com'
export function isSentinel(endpointUrl: string): boolean
export async function* sendSentinelMessage(signal?: AbortSignal): AsyncGenerator<StreamChunk>
```

The reply streams through `loremStream`'s SSE machinery (lifted from `dummy.ts` or exported from it)
so the real parser runs and the text arrives word by word like a live backend.

**Four call sites, not one.** `sendMessage` is the obvious one, and the only one that already
short-circuits on `debugMode`. The other three make live requests today and would resolve DNS for a
host that must never be contacted:

- `connectors/openaiCompatible.ts` `sendMessage`, beside the existing `debugMode` check.
- `connectors/listModels.ts`, returning one canned model so the model picker has something to pick.
- `settings/ConnectionEditor.tsx` connection test, reporting success without a request.
- `settings/readContextLimit.ts`, returning a fixed number.

Miss one and the string leaves the tab. `checkSentinel.ts` asserts `isSentinel` matches the URL with
and without scheme, with and without `/v1`, and rejects lookalikes (`xenia.nessuvia.com.evil.test`,
`notxenia.nessuvia.com`). CLAUDE.md's "four paths leave the tab" list stays true and gains a
sentence saying this URL isn't a fifth.

Global, so a user who types the URL by hand gets the same behaviour. The comment at `isSentinel`
says why: the reply explains itself, and a magic string that fails closed beats a flag on a record
that a copied connection wouldn't carry.

## Step kinds

```ts
type TutorialStep =
  | { kind: 'point'; target: string; body: string[]; side?: Side }
  | { kind: 'type'; target: string; text: string; body: string[] }
  | { kind: 'awaitValue'; target: string; expect: (v: string) => boolean; body: string[] }
  | { kind: 'awaitClick'; target: string; body: string[] }
  | { kind: 'awaitRoute'; target: string; route: string; body: string[] }
  | { kind: 'run'; act(): Promise<void>; body: string[] }
```

`point` is the tour behaviour. The other five are why this exists.

- `type` writes into the real field character by character, dispatching an `input` event so React's
  onChange fires. Native value setter, not `el.value =`, or React ignores it.
- `awaitValue` listens on the field and advances when `expect` passes. Used for the API key.
- `awaitClick` and `awaitRoute` gate on the user. `awaitRoute` also needs the target to mount before
  it measures, so it polls for the selector after the route matches.
- `run` covers "create the chat" without inventing a click for it.

Every gated kind blocks Next. `Exit tutorial` is always live.

Every kind also takes an optional `dock?: 'top' | 'bottom'`, read only on mobile. See Mobile.

## Back

A `run` step is a one-way barrier. Back is hidden on the run step itself, and on the step directly
after it, since that one would land on the run step and create a second chat. From two steps on,
Back works normally and walks back as far as the barrier.

So with a run at 5: steps 1 to 4 have Back, 5 and 6 don't, 7 onward go back to 6 and stop there.
The rule is `index > 0 && !isRun(index) && !isRun(index - 1)`, plus a floor on how far back the
Back button may walk. It falls out of one helper that finds the last run step at or before the
current index.

This keeps `run` steps free to be destructive and means `act()` never needs to be idempotent. The
alternative was making every `act()` check whether it had already run, which is a rule every future
tutorial author would have to remember and nothing would enforce.

## Mobile

The box docks to a screen edge rather than anchoring beside the target, as tours already do. Two
changes on top of that.

Compact: less padding, smaller type, and the paragraph count is the thing to watch when writing a
step. A docked box tall enough to cover half the screen defeats the point of pointing at something.

The edge is chosen per step rather than fixed to the bottom. The target's centre decides: a target
in the top half of the viewport docks the box at the bottom, a target in the lower half docks it at
the top. This is what makes gated steps work on a phone, since the field the user has to type into
can't be the thing hidden behind the instructions telling them to. A step may override with
`dock: 'top' | 'bottom'` when the automatic pick reads badly, the same escape hatch `side` gives on
desktop.

### The soft keyboard

On a phone the keyboard takes roughly half the screen, and on an `awaitValue` step it opens over
exactly the area the tutorial is docked in. The box hides while the keyboard is up and comes back
when it goes down. Required behaviour, not a polish item: without it the user is typing into a field
they can't see.

Detected from `visualViewport`, not from focus. A field can be focused with a hardware keyboard
attached, or focused programmatically by the step before it, and neither should hide anything. The
signal is `visualViewport.height` dropping meaningfully below `window.innerHeight`; listen on
`visualViewport`'s `resize`, and remember it fires on scroll-driven URL bar collapse too, so the
threshold needs to be a real fraction of the height rather than a few pixels.

While hidden, the cutout and the hand stay. The user still sees which element they're aimed at,
just not the paragraph about it. `Exit tutorial` needs to survive somehow, since a stuck user with
the keyboard up otherwise has no way out: likely a small floating button rather than the whole box.

The instruction being unreadable mid-type is the thing to look at in the browser. If it reads badly,
the fallback is a one-line bar instead of a full hide, but the full hide is what to build first.

One more case the automatic dock rule doesn't cover: a target taller than half the screen, where
centre-based picking is arbitrary. Falling back to whichever edge leaves more of the target visible
is the likely fix.

## Flow: Getting started

`core/tutorial/tutorials/gettingStarted.ts`.

1. Land on Settings. Point at `.pageTabs`, then `.connectionList` empty state.
2. `awaitClick` the add-connection button.
3. `type` the endpoint URL into the field. This is the long fiddly one, so it's demonstrated.
   Copy names the URL as a stand-in that goes nowhere.
4. `awaitValue` on the API key field, expecting `xenia`. Copy says a key is often absent on a local
   endpoint, and that this one is a placeholder because the URL is too.
5. `point` at the model picker, now populated by the canned list.
6. `point` at Miscellaneous. One step, not a tour of it: those settings carry their own hints.
7. `awaitRoute` on the Chat nav item, waiting for `/chat`.
8. `run` creates a chat with the bundled Nessuvia character and navigates to it.
9. `awaitValue` then `awaitClick` on the composer: the user sends a message and reads the sentinel
   reply, which tells them what to fix next.

Step 9 is the point of the whole thing. The tutorial ends with the app explaining its own limit
rather than with a congratulations panel.

## Module

`src/modules/tutorials/` with `index.ts` calling `registerModule`, so `main.tsx` gains one import
and nothing else.

- List page: one card per tutorial (name, one-line description, Start), plus a search input
  filtering on name and description.
- `tutorialsEnabled: boolean` in `settingsStore`, defaulting true, next to `writeEnabled` and
  `multiplayerEnabled`. Off hides the sidebar row and the route, same wording as those two.
  Not `plugin: true`: plugins default off, and this should be on for the users who need it most.
- Sidebar row in the main nav.

## State

`core/stores/tutorialStore.ts`: `{ activeId, index, start, next, exit }`. In the store rather than
the component because the tutorial outlives the route. Nothing persists. An interrupted tutorial
starts again from step 1, same policy as tours.

`app/TutorialHost.tsx` mounts beside `TourHost` in the shell and renders when `activeId` is set.
`TourHost` gains one guard: it doesn't offer a tour while a tutorial is running. `settings.md`
stays, as the quick refresher for someone who already has a connection.

## Verifying

`core/tutorial/checkTutorial.ts`, run by `agent-test.sh`:

- Every `target` in every tutorial appears as a class or id somewhere under `src`. This is the check
  that matters. Hard gates plus exit-only means a renamed class makes the tutorial unfinishable, and
  today nothing would say so until a user hit it.
- No tutorial has a gated step as its last step.
- Ids are unique.

`core/connectors/checkSentinel.ts` as above.

Both are plain `node --experimental-strip-types` scripts with `assert`, so their own imports carry
explicit `.ts` extensions.

## Order

1. `sentinel.ts` and `checkSentinel.ts`, wired into all four call sites. Standalone and testable by
   hand: make a connection with that URL, send a message.
2. Hoist geometry out of `Tour.tsx` into `SpotlightOverlay.tsx`, including the mobile dock edge.
   Tours must still work unchanged, and they inherit the flipping dock for free.
3. `core/tutorial` types, store, and `TutorialHost` with `point` only, to prove the loop.
4. The five action kinds.
5. `gettingStarted.ts` and `checkTutorial.ts`.
6. The `tutorials` module, list page, sidebar row, and the settings toggle.

Steps 1 and 2 are each worth stopping at for a browser check before the next one starts.

## Open

- A target taller than half the screen, where the dock rule has no good answer.
- What `Exit tutorial` looks like while the keyboard is up and the box is hidden.
- Whether hiding the box mid-type costs the user the instruction they were following.

All three want a real phone, not a narrow desktop window. The keyboard ones can't be checked any
other way, since a desktop browser has no soft keyboard to shrink `visualViewport`.
