// Wipes every origin-scoped store this app writes to, for testing a first load.
// Deletes databases by enumeration rather than by name. Nothing survives a rename.
export async function wipeEverything() {
  const dbs = await indexedDB.databases()
  await Promise.all(
    dbs.map(
      (d) =>
        new Promise<void>((resolve) => {
          if (!d.name) return resolve()
          const req = indexedDB.deleteDatabase(d.name)
          // blocked fires when another tab holds the db open; resolving anyway lets the
          // reload proceed and the delete completes once this tab lets go.
          req.onsuccess = req.onerror = req.onblocked = () => resolve()
        }),
    ),
  )
  localStorage.clear()
  sessionStorage.clear()
  // no caches/service-worker sweep, this app registers neither.
}
