import { Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useSettings } from '../core/stores/settingsStore'
import { isEnabled, modules } from './moduleRegistry'
import PageLoader from './PageLoader'

export default function AppRoutes() {
  const writeEnabled = useSettings((s) => s.writeEnabled)
  const multiplayerEnabled = useSettings((s) => s.multiplayerEnabled)
  const enabledPlugins = useSettings((s) => s.enabledPlugins)

  // set during render rather than in an effect, document.title isn't React state and
  // nothing reads it back. Per-record titles (chat name, story name) would need the module to
  // report its own title instead.
  const { pathname } = useLocation()
  const current = modules.find((mod) => pathname.startsWith(mod.route))
  document.title = current ? `Xenia | ${current.label}` : 'Xenia Nessuvia'

  return (
    <Routes>
      {modules
        .filter((mod) => mod.id !== 'write' || writeEnabled)
        .filter((mod) => mod.id !== 'multiplayer' || multiplayerEnabled)
        .filter((mod) => isEnabled(mod, enabledPlugins))
        .map((mod) => (
          <Route
            key={mod.id}
            path={`${mod.route}/*`}
            // Module components are lazy: each route needs a boundary. The spinner delays its
            // own fade-in. A chunk that lands quickly still shows nothing.
            element={
              <Suspense fallback={<PageLoader />}>
                <mod.component />
              </Suspense>
            }
          />
        ))}
      <Route path="*" element={<Navigate to={modules[0]?.route ?? '/'} replace />} />
    </Routes>
  )
}
