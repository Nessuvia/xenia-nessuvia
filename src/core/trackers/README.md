# Trackers

Values a character's replies keep up to date (affection, health, ...).

- Defs ride on the card: `Character.trackers`, exported as `extensions.nessu.trackers`.
- `parseState.ts` reads a reply's `<state>` tag. Each swipe's parse is stored in
  `Message.trackerUpdates`.
- `trackerValues` (`trackerState.ts`) folds those down the history with the player's overrides, so
  swiping rolls back.
- `buildPrompt` injects the visible values and hands every value to `core/prompt/template.ts`, so
  `{% if affection > 50 %}` works.
- `stripState` hides the tag at render only. The stored reply keeps it.
- Widgets and creator CSS are in `app/TrackerWidgets.tsx`.
