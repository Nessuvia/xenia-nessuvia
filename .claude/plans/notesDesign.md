# Notes: design

A Trilium-style notebook for writing without a model: short stories and fanfic now, with room for a
novel later. A new module, `modules/notes`. Write mode is left alone.

## Terms

- **Note**: one record. A title, markdown text, and a few fields. Every note is the same kind of
  thing. A scene, a chapter, a character sheet and a folder are all notes.
- **Tree**: the notes arranged by parent. Each note has one parent or none (a top-level note). Order
  among siblings is set by hand.
- **Children / descendants**: a note's direct children, and everything below it.
- **Manuscript**: a reading view of any note. It shows the note's text, then its included
  descendants' text, depth first in tree order, as one continuous document. Not stored. Built when
  opened.
- **Included**: the per-note "In manuscript" checkbox. On by default. Off for reference notes
  (character sheets, research). An excluded note takes its whole subtree out with it.

A short story can be one note. A novel can be a story note with chapter notes under it, scene notes
under those, and a "Research" note (excluded) holding reference notes. Open the story note's
manuscript to read the whole thing.

## Scope

In:

- Note tree in the sidebar, taking the rail over while on `/notes` (the way an open Story or chat
  does in `app/Sidebar.tsx`). A back link at the top returns to the normal nav.
- Tree actions: add top-level note, add child, rename, delete (with its subtree, after a confirm),
  drag to reorder and to reparent. A row menu offers Move up, Move down, Indent, Outdent for when
  dragging isn't practical (phones). No expand caret: opening a note shows its children, and
  clicking the open note again hides them.
- Search box above the tree: substring match on title and text, results as a flat list.
- Editor: the Write mode document editor (`modules/write/StoryDocument.tsx`, CodeMirror with
  `proseMarkup` decorations), minus the generation parts. Hoist the shared part to `/app` if it
  doesn't take a prop cleanly.
- Page header: the title only. Tab from the title goes into the text.
- Word count in the page header, level with the title.
- Editor bar, joined to the top of the text: status, In manuscript, Synopsis (dialog), Links
  (dialog), Manuscript, then Child note and Delete as icons. Delete takes two clicks: the first
  turns it red and reads "Delete?". The text fills the rest of the screen and scrolls inside.
- Manuscript view: a toggle on the editor bar. Read-only. Each section is headed by its note's
  title and clicking the heading opens that note. Shows the manuscript's word count.
- Links: `[[Note title]]` in text, styled as a link and opened with a click. A link to a title that
  doesn't exist is styled as missing, and clicking it creates that note as a child of the current
  one. The Links dialog lists the notes this one links to and the notes linking here.
- Rename rewrites links: renaming a note replaces `[[Old title]]` with `[[New title]]` in every
  note's text, after a confirm naming how many notes change.
- Sync and backup cover the new table.

Out (later, or never):

- Snapshots / revisions.
- AO3 metadata and export.
- Editing in the manuscript view. Export of a manuscript (`exportStory.ts` is the starting point).
- Tags, word-count targets, a corkboard of synopses.
- Writing stats (words per day, streak). Built, then removed: `writingDays` is dropped in
  `db.version(22)`.
- Cloning a note under several parents, Trilium's attributes and query language, non-text note
  types, scripting, encryption.
- Any model involvement. Joining Notes and Write into one tree is a later decision.

## Data

One new table, `notes`, in the `db.version(22)` block, added to `TableName`.

```ts
interface Note {
  id?: number
  ownerId: string
  parentId: number | null   // null = top level
  sortOrder: number         // among siblings
  title: string
  text: string              // markdown, exactly as typed
  status: 'idea' | 'draft' | 'revised' | 'done'
  synopsis: string          // one line
  inManuscript: boolean     // default true
  createdAt: number
  updatedAt: number
}
// notes: '++id, ownerId, parentId'
```

`newNote()` in `notesStore` defaults status to `draft` and `inManuscript` to `true`.

Expanded tree rows and the last open note are non-portable preferences:
`nessuTavern.notesExpanded`, `nessuTavern.notesLastOpen`.

## Rules

- **Links resolve by title**, first match in tree order. Titles aren't forced unique. Rename
  rewrites only exact `[[Old title]]` matches.
- **Rename skips the renamed note's own text.** It's open in the editor, which would save its old
  copy back over the rewrite. A note linking to itself keeps the old title.
- **Links open on Ctrl/Cmd+click** in the editor, so a plain click still places the caret. The Links
  dialog does the same on a phone.
- **Delete** removes the subtree. Links to deleted notes show as missing.
- **Reparenting** can't drop a note into its own subtree.

## Sync

Per-note files, following the per-character layout in `core/sync/syncFiles.ts`:
`notes/<id>.json`, so editing one note moves one file.

## Checks

One `check*.ts` each for the logic that can break quietly:

- manuscript order and exclusion (depth first, an excluded note drops its subtree)
- link rename rewrite (exact matches only, other text untouched)
- reparent cycle guard

## UI copy

Plain labels: "In manuscript", "Status", "Synopsis", "Manuscript", "Links", "Backlinks". Empty
tree: "No notes yet."
