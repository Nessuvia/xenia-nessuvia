# Test assets

Real files from the wild, kept so the `check*` scripts can read a format instead of a hand-written
mock. Nothing here is imported by the app, so none of it reaches the bundle.

- `honkai-star-rail.json`: a SillyTavern world-info export. Index-keyed `entries` object,
  `key`/`keysecondary`, `disable`. Read by `modules/lorebooks/checkImportLorebook.ts`.
- `mushoku-tensei-rpg.json`: a v3 character card with a 209-entry `character_book` inside it.
  Read by `modules/characters/checkImportCard.ts`.
- `Gemma_NoThink.json`: a SillyTavern settings bundle. Read by
  `core/sillytavern/checkSillyTavern.ts`.
- `Micro-FF5.json`: a SillyTavern chat-completion preset (Frankenstein). Read by
  `core/sillytavern/checkSillyTavern.ts`.
- `nessuvia.png`: a Tavern PNG with the card JSON in a tEXt chunk. Read by
  `core/connectors/checkPngCard.ts`. This is a copy. The live one is
  `core/cards/bundled/nessuvia.png`, which the app seeds on a fresh install, and editing
  that one does not update this one.

Adding one: drop the file here, name it after what it is, and add a line above saying which check
reads it and which quirk of the format it covers.
