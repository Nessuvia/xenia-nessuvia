# Storage

Everything durable is in Dexie (`db.ts`). This folder is the only importer of Dexie. Components and
stores go through `storage` (`storageInterface.ts`).

## Schema

`db.ts` has one `db.version(N).stores({...})` block holding the **complete** schema. There's no
version chain and no `upgrade()` callback: an older local DB upgrades straight to the current
schema. This codebase doesn't migrate.

- **Adding a table or index:** edit that block, raise the number, and add the name to `TableName`
  in `storageInterface.ts`. The number only goes up: IndexedDB refuses to open a database whose
  stored version is higher than the one requested.
- **Adding a plain field:** no version bump. Put it in `types.ts` and default it in the store's
  `newX()` factory. Indexes are only for fields you query with `find()`.

## Dirty tracking

`storage.put/remove/clear/putAll` call `markDirty` before the write, and that's how sync knows what
changed (`core/sync/dirtyTables.ts`). A whole-table replacement (restore, pull) runs inside
`withDirtySuppressed`.

## localStorage

A few Zustand stores persist to localStorage via `zustand/middleware` `persist` rather than Dexie.
Their keys start with `nessuTavern.`. `settingsStore` (`nessuTavern.settings`) holds connections
and the API keys with them.

`backup.ts` is the only code that reads or writes those keys for export/import, and it carries
`nessuTavern.settings` only. `stripApiKeys.ts` blanks secrets by field name before a backup file
leaves the browser. A backup gets emailed around, and a missed secret is the failure that matters.
A new secret field gets added there.

## Preferences

Small view state belonging to this browser rather than to the user's data (a collapsed panel, which
rail is open, a dismissed example) goes straight to `localStorage` under a `nessuTavern.*` key. No
store, no Dexie table. `backup.ts` reads only the key it names, so a new key stays out of a backup
by construction. `nessuTavern.sidebarCollapsed` in `app/Sidebar.tsx` is the pattern.

The test: should restoring a backup on another machine carry it? If not, it's a preference.

## Seeding

Bundled rows (palettes, characters, stacks, ...) are written on first load and guarded by a flag in
`seedFlags.ts`, so a delete sticks.
