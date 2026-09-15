import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './app/Sidebar'
import AppRoutes from './app/routes'
import { preloadModules } from './app/moduleRegistry'
import JoinView from './modules/join/JoinView'
import PageBackground from './app/PageBackground'
import SplashScreen from './app/SplashScreen'
import TourHost from './app/TourHost'
import { usePalettes } from './core/stores/palettesStore'
import { usePersonas } from './core/stores/personasStore'
import { useParamDefs } from './core/stores/paramDefsStore'
import { useStacks } from './core/stores/stacksStore'
import { useApplyPalette } from './core/palette/useApplyPalette'
import { useApplyWebfont } from './core/palette/useApplyWebfont'

export default function App() {
  const loadPalettes = usePalettes((s) => s.load)
  const ensurePersona = usePersonas((s) => s.ensureActive)
  // The sampler library loads on boot rather than on the first visit to Settings: the send path
  // reads it synchronously to shape every request body.
  const loadParamDefs = useParamDefs((s) => s.load)
  // Seeds the default chat and Story stacks on a fresh install, so they are there before the first
  // visit to Prompts.
  const loadStacks = useStacks((s) => s.load)
  useEffect(() => {
    loadPalettes()
    loadParamDefs()
    loadStacks()
    // A fresh install gets its "User" persona on boot, not on the first visit to Personas.
    ensurePersona()
  }, [loadPalettes, loadParamDefs, loadStacks, ensurePersona])
  useApplyPalette()
  useApplyWebfont()

  return (
    // useTransitions={false}: React Router 7 wraps navigation in startTransition by default, and a
    // transition keeps the current screen on screen instead of showing a Suspense fallback, so
    // PageLoader never appeared and a slow module chunk read as the page hanging.
    <BrowserRouter useTransitions={false}>
      <Routes>
        <Route path="/join/:sessionId" element={<JoinView />} />
        <Route path="*" element={<AppShell />} />
      </Routes>
    </BrowserRouter>
  )
}

// Module scope, not defined inside App: a component declared in a render body is a new component
// type on every render, so React would unmount and remount this whole subtree, background fade
// and all, every time App re-renders for a palette change.
function AppShell() {
  // Module chunks come down in the background once boot is over, so the first click on a tab has
  // nothing left to fetch. Held until after the splash so the animation keeps the network to itself.
  // Lives here rather than in App: a guest on /join never mounts the shell and never prefetches.
  useEffect(() => {
    const t = setTimeout(preloadModules, 2200)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="appShell">
      <SplashScreen />
      <PageBackground />
      <Sidebar />
      <main className="appContent">
        <div className="appContentInner">
          <AppRoutes />
        </div>
      </main>
      {/* Outside the rail and the content pane: the tour dims both, so it cannot sit inside
          either one's stacking context. */}
      <TourHost />
    </div>
  )
}
