# Sync

Pushes and pulls the library to the user's own Dropbox app folder. No server of ours is in the
path.

- `dropboxClient.ts` is the only file here that talks outward. Every request carries a bearer
  token that `dropboxAuth.ts` owns.
- `syncFiles.ts` lays the library out as files: a folder per character holding its card, chats and
  images, and whole files for the other tables. A file is the unit compared and moved.
- `dirtyTables.ts` decides which groups get rebuilt and hashed. Storage writes mark tables dirty
  (see `core/storage/README.md`).
- `syncStore.ts` runs push and pull.

The module (`modules/sync`) sits under Import/Export in the sidebar rail rather than the main nav.
Commenting its import out of `main.tsx` turns it off.
