# Onboarding tour plan

A per-page walkthrough: dim the page, highlight one element, show a text box with a pointing hand
next to it, click for next. Copy lives in markdown files you edit directly.

## Decisions

| Question | Answer |
| --- | --- |
| Library | None. Hand-rolled, ~250 lines in `core/tour` + `app/Tour.tsx`. |
| Targets | CSS selectors written in the content file. |
| Entry | A help button on every page that has a tour, plus a one-time first-run offer. |
| Progress | Nothing persists except the first-run flag. Every run starts at step 1. |
| Mascot | One hand PNG, rotated to point at the target. Poses are a later swap. |
| Broken selector | Step is skipped. In DEV it also warns to the console. |
| Routing | One tour per page. No cross-page chaining in v1. |
| Mobile | Text box docks to the bottom, target scrolls into view, hand points at it. |

## Geometry

A cutout is four divs or one `box-shadow: 0 0 0 9999px`. Placement is `getBoundingClientRect` plus a
flip when the box would leave the viewport. Scroll is `scrollIntoView({ block: 'center' })`. If
placement turns out fiddly against the chat rails, `@floating-ui/react` drops in for that one job.

## Content format

One file per tour, `src/core/tour/tours/<id>.md`, where `<id>` matches the module id. Loaded with
`import.meta.glob('./tours/*.md', { query: '?raw', eager: true })`, so adding a tour is adding a
file. No registry edit, no import in `main.tsx`.

```md
# Chat

## .chatComposer
Type here and press Enter to send. Shift+Enter starts a new line.

## .chatSidebar | left | desktop
The rail holds the character, the persona and the prompt stack for this chat.

## .chatMessage:last-child
Hover a message for the edit, retry and branch buttons.
```

- `#` on line one is the tour's display name, used in the help button and the first-run offer.
- `##` starts a step. Everything after it on the line is the target selector, then optional
  pipe-separated directives.
- Directives: `left` `right` `top` `bottom` force a side (default is auto), `desktop` and `mobile`
  limit a step to one, `center` means no target at all (an intro or outro step).
- Body is everything until the next `##`. Blank lines split paragraphs. No markdown rendering beyond
  paragraph splitting. Text is rendered as React text nodes.

Parser is `parseTour.ts`, roughly 40 lines, with `checkParseTour.ts` next to it covering: a step with
no directives, every directive, a `center` step, a body with blank lines, and a malformed `##` line.

## Files

```
src/core/tour/
  tours/*.md          the copy, one file per page
  parseTour.ts        markdown to Step[]
  checkParseTour.ts   the check script
  tours.ts            glob import, tour lookup by module id, hasTour(route)
  types.ts            Step, Tour
src/app/
  Tour.tsx            the overlay: cutout, text box, hand, next/back/skip
  TourHost.tsx        mounted once in App.tsx; owns which tour is running
  TourButton.tsx      the help button, renders null when the route has no tour
  tour.css
public/tour/hand.png  the pointer
```

`core/tour` holds no React and no DOM. `app/Tour.tsx` holds all of it. The parser stays checkable by
a plain node script.

## How a step runs

1. `document.querySelector(step.target)`. Missing means skip, and in DEV `console.warn` the tour id,
   step index and selector.
2. `scrollIntoView({ block: 'center', behavior: 'smooth' })`, then measure after a frame.
3. Cutout is a fixed div at the target's rect with `box-shadow: 0 0 0 9999px var(--overlay)` and a
   `--radiusMd` corner: one element, no four-div seams. `pointer-events: none` on it; a full-screen
   sibling swallows clicks and blocks the app underneath during the tour.
4. The text box is placed on the side with the most room. The hand sits on the box edge facing the
   target, rotated in 90 degree steps to match the side.
5. Advance on click anywhere, Enter, Space or right arrow. Back on left arrow. Escape ends the tour.
6. Re-measure on `resize` and on `scroll` (capture phase, passive), to keep the cutout aligned when a
   rail opens mid-tour.

Targets that only exist inside a closed rail are the known hole. On mobile the sidebar is a drawer;
steps pointing into it get `desktop`. Nothing opens a rail for a step in v1.

## Mobile

Below 700px the text box leaves the anchored position and docks to the bottom of the viewport, full
width, with the hand on its top edge pointing up at the highlighted element. The target scrolls to
center, above the box. `useMediaQuery('(max-width: 700px)')` picks the mode, matching the repo's one
breakpoint.

## Styling

Palette vars only. `--surfaceRaised` for the box, `--border`, `--text` for body, `--textMuted` for
the step counter, `--accent` for the next button, `--overlay` for the dim.

The overlay sits at `--layer-9`, above dialogs and below the splash. That rung is already on the
ladder in `index.css` waiting for it.

## Entry points

`TourButton` renders in the page header of any route with a tour. On first run, a one-time offer
appears on whatever page loads first, pointing at that button. `nessuTavern.tourSeen` is the only
persisted state: a non-portable browser preference, straight to `localStorage`, no store, no Dexie
table, out of the backup by construction.

Tours do not chain in v1: the offer starts the current page's tour and nothing else. A later change
covers the sequence of every page, as a `tourOrder` array in `tours.ts` plus a "next: Characters"
button on the last step.

## Scope

**In v1**

- Overlay, cutout, text box, hand, keyboard and click advance.
- Markdown content files plus parser plus check script.
- Help button and the first-run offer.
- Mobile bottom sheet.
- Tours written for `chat`, `characters`, `personas`, `lorebooks`, `prompts`, `settings`.

**Out**

- Cross-page chaining and the full-site walkthrough.
- Avatar poses. One hand, one PNG. The pointer is a component taking a side; a pose prop is an
  additive change.
- Resume after refresh, completion tracking, "tours you have not seen".
- Any step that opens a rail, a drawer or a modal for you.
- Tours for `write`, `multiplayer`, `ask`, `appearance`, `sync`. Add them by dropping in a file once
  the mechanism is proven.

## Risk

Selectors drift. Nothing in the build catches a renamed class; skip-on-missing means a tour quietly
gets shorter. Two mitigations: prefer selectors on classes that already carry a module prefix, and
add a DEV panel under `/learn` that runs every tour and lists dead selectors. That panel is maybe 30
lines.

## Build order

1. `types.ts`, `parseTour.ts`, `checkParseTour.ts`. No UI, checks pass.
2. `tours.ts` glob loader plus one real `chat.md`.
3. `Tour.tsx` desktop only: dim, cutout, box, advance. Hardcode the tour to run from a temp button.
4. Hand PNG and side placement.
5. Mobile bottom sheet.
6. `TourHost`, `TourButton`, first-run flag, `--zTour`.
7. Write the remaining five content files.
