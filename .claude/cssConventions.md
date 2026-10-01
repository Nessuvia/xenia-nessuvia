# CSS conventions

Read this before writing or editing any `.css` file or any `className` in this repo. It's the long
form of the Style section in CLAUDE.md: that section is the summary, this is the rulebook.

Every rule is a pair. The failure this file exists to stop is **drift**: values that are each
defensible on their own and wrong next to their neighbours. A 7px gap in a wall of 8px, a
`font-size: 13px` on an element that should have inherited, a fresh `z-index: 40` in a stack that
already had a place for it. None of it looks broken in isolation, all of it has to be corrected by
hand.

The house rule underneath all of the below: **read the neighbouring rules before adding one.** If a
value in this file disagrees with a value already in the file you're editing, match the file and
say so.

---

## 1. Reuse before you write

Check for an existing component or an existing class before opening a stylesheet at all.

Shared components live in `/app` with their own `.css` and are imported by modules: `PageHeader`,
`CollapseButton`, `Avatar`, `ColorInput`, `ColorStack`, `EntityPicker`, `TwoColumn`, `PageLoader`,
`PromptPreviewPanel`. Hooks: `useCloseOnOutside` (every button dropdown uses it), `useDragReorder`,
`useHashTab`, `useMediaQuery`.

- **No:** a new `.myThingChevron` rule that rotates an SVG on open.
- **Yes:** `<CollapseButton>`, which already does it and already matches every other rail in the app.

Second copy of a pattern is a nudge, third is the cue to hoist it into `/app`.

A module `.css` holds only what's specific to that tab. Anything two tabs share belongs in the
shared component's stylesheet.

---

## 2. Colors

Every color is a CSS var declared in `:root` in `index.css`. The active palette overwrites those vars
at runtime (`palette/useApplyPalette.ts`), so a hardcoded color is a value that stops following the
user's theme the moment they change it.

- **No:** `color: #a0a0ac;` · `background: rgba(255, 255, 255, 0.06);` · `border: 1px solid #2a2a33;`
- **Yes:** `color: var(--textMuted);` · `background: var(--surfaceHover);` ·
  `border: 1px solid var(--border);`

The vars, by role:

| Surfaces | Text | Lines | Other |
| --- | --- | --- | --- |
| `--bg` page | `--textBright` | `--border` | `--accent` |
| `--surfaceSunken` wells, inputs | `--text` body | `--borderStrong` | `--danger` |
| `--surface` panels, cards | `--textSoft` | `--borderAccent` | `--success` |
| `--surfaceRaised` | `--textMuted` labels, hints | | `--overlay` backdrops |
| `--surfaceHover` | `--textDim` disabled | | `--codeBg` / `--codeText` |
| `--surfaceActive`, `--surfaceSelected` | | | |

Need a tint of an existing var rather than a new one? Use `color-mix`, don't invent a hex:

```css
/* No */  background: #1e1e28;
/* Yes */ background: color-mix(in srgb, var(--surface) 80%, var(--accent));
```

**The only standing exceptions**, all of which are already in the tree, don't add a sixth without
a comment saying why:

- `#000` inside a `mask` / `-webkit-mask` gradient (`chat.css`), where the value is an alpha channel
  and not a color anyone sees.
- `#000` inside a shadow `color-mix` in `skins/glass.css`.
- `#000` on the splash screen, which paints before any palette has loaded.

Something that has to differ between light and dark palettes matches `:root[data-scheme='light']` (or
`'dark'`). The palette's Mode sets it: Light, Dark, or Auto, which reads `--bg`
(`paletteScheme` in `palette.ts`). Don't test a color's lightness yourself. The code editor's light
look in `index.css` is the pattern.

`--success` is deliberately not palette-driven and holds steady across themes. `--codeBg` /
`--codeText` are fixed for the same reason: code has to stay readable against its own background
whatever the palette's prose colors are.

---

## 3. Spacing

The scale is **2 · 4 · 6 · 8 · 12 · 16 · 24**, in px, for `padding`, `margin` and `gap`. 8 and 12
carry most of the app; 4 and 6 are the tight end; 16 and 24 are for page-level padding.

- **No:** `padding: 7px 9px;` · `gap: 5px;` · `margin-bottom: 14px;`
- **Yes:** `padding: 6px 8px;` · `gap: 4px;` · `margin-bottom: 12px;`

If the design needs a value off the scale, it's optical correction and it takes a comment
saying what it's correcting.

```css
/* The icon's glyph sits 1px high in the font, so the row needs uneven padding to look centred. */
padding: 7px 8px 6px;
```

Some off-scale values already exist (28 uses of `7px`, some `3px`, `5px`, `14px`). Leave them; don't
reformat a file to the scale as a side quest. The rule governs what you *add*.

Literal px from the scale is the convention. Form controls are the one exception and have their
own vars (section 4a).

---

## 4. Type

**Default to not setting `font-size` at all.** Inheritance is the correct answer far more often than
a number is, and every unnecessary declaration is a place for drift.

- **No:** `font-size: 13px;` on a `<span>` inside a panel that's already 13px.
- **Yes:** nothing. Let it inherit.

When a size has to differ from its parent, take it from **11 · 12 · 13 · 14** px.

| Size | Used for |
| --- | --- |
| `11px` | badges, counts, dense metadata |
| `12px` | hints, labels, secondary rows |
| `13px` | the app's default UI text |
| `14px` | emphasis inside a panel, small headings |

Anything larger is a heading and belongs to the small set already in use (`15px`, `18px`, `22px`,
`28px`); pick one of those, don't add a new one.

Units: **px for chrome.** `rem` and `em` appear in ~40 rules and are correct in exactly two places:
inside message and story content, where the user's own font scaling should apply, and where an `em`
is deliberately relative to the parent (`0.85em` on a nested label). Don't sprinkle `rem` through UI
chrome for tidiness.

`font-weight` follows the same default: leave it alone unless the element is a heading or
de-emphasised. `:root` sets `font-weight: var(--textWeight, 400)` as a palette knob, and
anything with a weight of its own opts out of it.

---

## 4a. Form controls

Every text field, select, number box and button reads its size from vars in `:root` (`index.css`):

| Var | Value | For |
| --- | --- | --- |
| `--fieldBg` | `var(--surfaceSunken)` | every field: fields read as sunken wells, never raised panels |
| `--fieldPad` | `7px 10px` | text fields, selects, textareas |
| `--fieldFont` | `13px` | the same, and buttons (the `button` baseline sets it) |
| `--buttonPad` | `7px 12px` | buttons |
| `--numberWidth` | `72px` | number boxes |

These are why a field, a select and a button on one row come out the same height. Don't restate a
literal. A module rule that has to style a field points at the var.

- **No:** `.myThing input { background: var(--bg); padding: 6px 8px; font-size: 14px; }`
- **Yes:** nothing, when the baseline in `index.css` already covers it. Otherwise
  `padding: var(--fieldPad);`

The baseline sits inside `:where()`, so its specificity is zero and any module class beats it. A
field that has to differ (a compact chip editor, the chat composer, an inline title rename) sets
its own value with a comment saying why.

A unit goes in the label, `Size (px)`, never as bare text after the box. A trailing unit pushes its
box left of the boxes above and below it.

In a form, every control fills its row (`flex: 1`), so a select, a slider and a text field share a
right edge. A slider's number box stays `--numberWidth` at the end of the slider's row.

Two values close together are one value. Before adding a 64px number box beside a 72px one, use the
var.

---

## 4b. Page headers

Every top-level page starts with `<PageHeader>` from `app/PageHeader.tsx`:

```tsx
<PageHeader title="Games" hint="One line about the page." actions={<>{buttons}</>}>
  <PageTabs tabs={tabs} current={tab} onPick={setTab} />
</PageHeader>
```

Title on the left, actions on the right, an optional one-line hint under them, and the page's tabs
as children below that. The page root supplies the gap under it.

A page with tabs shows them as `<PageTabs>` (`app/PageTabs.tsx`), fed by the same `tabs` list the
module registers for its sidebar sub-items. The list lives in the module's own `tabs.ts` so the
index can import it without pulling in the lazy view. `useHashTab` drives the current tab, and
picking one writes the hash so the sidebar follows. A mode switch that isn't a tab (Prompts'
Chat/Story) goes in `actions`.

- An action with an icon puts its text in `<span className="btnLabel">` and carries a `title`.
  From 1300px down the label hides and the icon carries the button.
- On a narrow screen the actions wrap under the title as a row. Don't stack them into a column.
- Don't build a page title from a bare `<h2>` and a flex div. That's how every page ended up with
  a different header.

Secondary text under a field or heading is `.hint`, defined once in `index.css` (12px,
`--textDim`). A module rule only adds what differs, usually margin.

---

## 5. Radius

One var, `--radius` (6px), plus documented steps off it.

- **No:** `border-radius: 5px;` · `border-radius: 4px;` · `border-radius: 6px;`
- **Yes:** `border-radius: var(--radius);`

Larger surfaces step up, nested elements step down, always as `calc` so they follow the var:

```css
border-radius: calc(var(--radius) + 2px);   /* cards, popovers, menus */
border-radius: calc(var(--radius) + 4px);   /* full panels */
border-radius: calc(var(--radius) - 2px);   /* a chip inside a card */
```

`50%` for circles and `999px` for pills are fine as literals: they're shapes, not sizes.

---

## 6. Layering

Every `z-index` comes from the ladder in `index.css`. Don't invent a number.

The rungs are numbered, not named: `--layer-0` through `--layer-10`, one tier each, no gaps, higher
draws over lower.

| Var | For |
| --- | --- |
| `--layer-0` | `.pageBackgroundLayer`, behind all content |
| `--layer-1` | app content, the desktop sidebar, sticky toolbars |
| `--layer-2` | a menu anchored to the control that opened it |
| `--layer-3` | menus that escape their container: context menus, the collapsed-rail flyout |
| `--layer-4` | phone: the drawer open buttons |
| `--layer-5` | phone: an open side drawer |
| `--layer-6` | phone: the navbar open button |
| `--layer-7` | phone: the open navbar drawer |
| `--layer-8` | dialog backdrops and dialogs |
| `--layer-9` | the onboarding tour overlay |
| `--layer-10` | the boot splash |

- **No:** `z-index: 40;` because 30 wasn't enough.
- **Yes:** `z-index: var(--layer-3);` If nothing on the ladder fits, that's a design question
  to raise, not a number to pick.

A new tier goes in at its place in `index.css` and every rung above it shifts up by one. That's a
single edit, because no stylesheet outside `index.css` names a number: they all say `var(--layer-N)`.
Renumbering means moving the var names on the rules that move, so do it with the ladder comment open
and check the phone stack after.

Rungs 4 through 7 are the phone drawer stack, in order: `drawerOpenButtons`, `.sideDrawer`,
`.sidebarOpenButton`, `.sidebar.sideDrawer`. Each is commented where it lives,
because the navbar is the way out of any screen and must never end up behind a panel. Don't take a
rung in that range for anything else.

A small `z-index` used purely to order siblings inside one container (the pair on `.chatRow` and
`.chatExportMenu` in `chat.css`) isn't a tier and doesn't use a var. It's a bare `1`, and it gets
a comment saying what it's ordering against.

The two exported-document stylesheets (`exportChat.ts`, `exportStory.ts`) build standalone HTML
files that never load `index.css`. Their `z-index` values aren't on this ladder and aren't drift.

---

## 7. Selectors

**Give every element you style its own class.** No bare-tag descendant selectors in new work.

```css
/* No: catches any button that ever lands inside .prompts, including shared components */
.prompts button { padding: 6px 10px; }

/* Yes */
.promptsActionButton { padding: 6px 8px; }
```

This isn't a style preference. `characters.css` carries this comment:

> `#root` because the chat module styles every `.chatView button`, and this one is the component's,

That's the cost, in full: a module's generic selector reached a shared component, and the fix was a
specificity escape hatch that now has to be maintained. Nine `#root` prefixes exist in the tree and
every one of them is a descendant selector that overreached.

There are 297 existing descendant selectors. They stay. Don't convert them wholesale, but when you
touch a rule that uses one and it's fighting you, adding the class is the fix.

**`#root` is the last resort, not a tool.** It's for a shared rule in `/app` that has to beat a
module's generic selector. It always carries a comment saying which selector it's beating and why,
because stylesheet order isn't something to rely on:

```css
/* #root to beat .formPage label, which stacks label content in a column. A checkbox belongs on
   one line with its text. */
#root .debugToggle { … }
```

Never reach for `#root` to win a fight against a rule you just wrote. Fix the selector.

---

## 8. Class names

camelCase, prefixed with the module or component that owns it. All CSS here is global, no CSS
Modules and no scoping, so a name is a claim on the whole app.

- **No:** `.row` · `.editorActions` · `.sidebar-item` (kebab-case) · `.libraryRow` in two modules
- **Yes:** `.chatComposerRow` · `.promptsEditorActions` · `.sidebarItem` · `.paramsLibraryRow`

**Grep before you name.** `grep -rn '\.yourName' src --include='*.css'`. A name that already exists
in another file is a collision, and it'll apply to both.

Eleven names are currently defined in two files each: `.chatView`, `.editorActions`,
`.characterList`, `.characterName`, `.chatBottomBar`, `.personaEditor`, `.personaEditorDescription`,
`.libraryRow`, `.lorebookRow`, `.lobbyDeny`, `.plotAddChapter`. Treat those as bugs waiting to bite,
not as precedent. If you're editing one and its two definitions disagree, say so rather than
guessing which is live.

Two kebab-case strays exist (`.sidebar-item`, `.sidebar-title`) plus `.react-colorful`, which belongs
to the library. Don't add to the first group.

---

## 9. Responsive

**No horizontal scrolling, anywhere.** Wide content wraps, shrinks or clips. `html, body` carry
`overflow-x: hidden` as the backstop (`index.css`), and the phone drawer opens on a sideways swipe
from anywhere on the screen, which a horizontal scroller would eat. Give flex children
`min-width: 0` and let rows `flex-wrap: wrap`. The one allowed exception is the Games hand of
cards, which has its own switch between scrolling and fitting on screen.

`max-width: 700px` is the breakpoint. Desktop-first: write the desktop rule, then override inside the
query.

```css
/* No */  @media (max-width: 640px) { … }
/* Yes */ @media (max-width: 700px) { … }
```

`max-width: 1300px` is the second tier, for a desktop window snapped to half a screen. It stays
CSS-only: the `useMediaQuery` shape switches stay at 700px. At that width the layout keeps its
desktop shape (sidebar, chat panel, hover, centered modals). Only list/detail stacking and
icon-only header buttons change.

A different width needs a comment saying what breaks at that width:

```css
/* The three-column swatch grid loses its middle column below this and the rows go ragged. */
@media (max-width: 900px) { … }
```

Four other widths already exist (560, 720, 900, 1200). They stay, but don't copy one just because it
is nearby.

CSS handles anything a stylesheet can say on its own. Reach for `useMediaQuery('(max-width: 700px)')`
only where the layout changes **shape** rather than style: a panel becoming a drawer, a list
becoming a picker. Never to change a color or a size.

`prefers-reduced-motion: reduce` is honoured in four places. Any transition you add that moves an
element, rather than fading it, belongs in one of those blocks.

---

## 10. Bans

**`!important`: never.** Zero uses across 33 files, and it stays zero. A specificity problem is
fixed at the selector: add the class, or use the documented `#root` prefix with its comment.

**Native CSS nesting (`&`): never.** Zero uses, and it stays zero. Every selector in this codebase
can be found by grepping for its full name, and nesting breaks that.

```css
/* No */
.chatRow {
  padding: 8px;
  & .chatRowLabel { color: var(--textMuted); }
}

/* Yes */
.chatRow { padding: 8px; }
.chatRowLabel { color: var(--textMuted); }
```

**Transitions and animations you weren't asked for: never.** CLAUDE.md's "keep styling light until
the polishing phase" applies here first. A screen that works and looks plain is done. No fade-ins on
mount, no hover lifts, no easing on a thing that was static a moment ago. The exceptions already in
the tree are deliberate and commented: the palette-swap fade, the drawer slide, the collapse chevron.

**Emoji or unicode glyphs standing in for icons: never.** Icons come from `@remixicon/react`.
Typography characters (`…`, `·`, `→`) in text are fine.

**`dangerouslySetInnerHTML`: never**, for any reason, anywhere. This origin holds API keys in
localStorage. User markup has exactly one vetted route: `palette/sanitizeHtml.ts` attached with
`replaceChildren` in `PageBackground.tsx`, and `palette/scopeCss.ts` for user CSS.

### Inline `style={{}}`: allowed, but narrowly

Thirteen uses exist and all are values a stylesheet can't know: a palette swatch's color, a slider
thumb's `left: %`, a computed row count. That's the bar.

```tsx
/* No: this belongs in the stylesheet */
<div style={{ marginTop: 8, border: 'none' }}>

/* Yes: the value is computed */
<span className="paletteSwatch" style={{ background: c }} />

/* Better, when several properties depend on one computed value: set a var, style in CSS */
<ul className="entityPickerList" style={{ '--pickerRows': rows } as CSSProperties}>
```

---

## 11. Skins

A skin is the structural half of a palette: `data-skin` on the root, and a stylesheet of
`[data-skin='x'] #root .panel { … }` rules. Four classes are the whole contract: `panel`, `navbar`,
`card`, `bubble`.

A skin may only change **how a surface is painted**: background, border, shadow, filter. Radius,
padding and spacing stay in the base stylesheet. A skin can therefore look wrong but can never break
layout, and that property is worth more than any effect it'd buy.

- **No:** `[data-skin='glass'] #root .card { padding: 12px; border-radius: 12px; }`
- **Yes:** `[data-skin='glass'] #root .card { background: …; backdrop-filter: …; }`

A new skin is a file in `app/skins`, a line in `app/skins/index.ts`, and an entry in `skins.ts`.

---

## 12. Before you hand off

Run through this on any diff that touches CSS:

- [ ] No hex, `rgb()` or `hsl()` outside `index.css`.
- [ ] Every spacing value is on the scale, or carries a comment.
- [ ] Every `font-size` you added is needed, and is on the scale.
- [ ] Every `z-index` is a `--layer-*` var.
- [ ] Every new class has a module prefix and isn't already defined elsewhere (grep it).
- [ ] No bare-tag descendant selectors in new rules.
- [ ] No `!important`, no `&` nesting, no unrequested motion.
- [ ] Media queries are `max-width: 700px` or `max-width: 1300px`, or commented.
- [ ] Anything two tabs now share moved to `/app` rather than being copied.
- [ ] Fields and buttons use the `--field*`, `--buttonPad` and `--numberWidth` vars, or nothing.
- [ ] A new page starts with `<PageHeader>`.
- [ ] Nothing scrolls sideways at 360px wide.

Then `npx pnpm build` and the `check*` scripts, and **stop**. The user drives Chrome and tests in the
browser personally. Report that the build is clean and say what's ready to look at.
