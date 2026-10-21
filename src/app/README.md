# App shell and shared UI

The sidebar, routing, the module registry (`moduleRegistry.ts`), and components and hooks shared by
more than one module. Check here before building a component. A pattern used in a third place gets
hoisted here: small component, obvious props, its own `.css`.

A few that are easy to miss: `ListInput` (a field that stores a list), `useCloseOnOutside` (every
button dropdown uses it), `useHashTab` (tabs read from the URL hash), `PageHeader` (every top-level
page starts with it).

## Reordering

There's no drag-and-drop library. Reordering is `useDragReorder.ts`.

- `itemProps` makes the whole row draggable. Use it for a row of plain content.
- A row holding an `input` or `textarea` uses `handleProps` on a drag handle and `dropProps` on the
  row. `draggable` on an ancestor stops Chrome placing the caret in the field.
  `modules/lorebooks/EntryRows.tsx` is the pattern.
