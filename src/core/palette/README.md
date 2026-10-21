# Palette

Appearance: palettes, webfonts, and user-written background HTML and CSS. The structural half of a
look is a skin, in `app/skins` (see `.claude/cssConventions.md`).

## User markup

This origin holds API keys in localStorage, so user markup has exactly one vetted route:

- `sanitizeHtml.ts` parses HTML in a `<template>` against a structural allowlist and rejects the
  whole input rather than scrubbing it. The result is attached with `replaceChildren`
  (`app/PageBackground.tsx`).
- `scopeCss.ts` wraps user CSS in `@scope` and refuses it whole if a stray `}` escapes the block.
- `remoteRefs.ts` finds outside addresses in parsed CSS and the sanitized DOM.

Stack looks use the same route with their own policy (`modules/prompts/README.md`). Nothing else
renders user or model markup.

## Bundled palettes

Drop an exported `.json` into `bundled/` and it seeds on a fresh install and shows in the Bundled
picker. No list to edit.
