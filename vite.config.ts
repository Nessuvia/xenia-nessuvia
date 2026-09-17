import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

// https://vite.dev/config/
export default defineConfig({
  // Build version shown in the sidebar credit line; package.json is the one place it lives.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Written out under the name index.html already links, replacing the hand-written
      // public/site.webmanifest that used to live there.
      manifestFilename: 'site.webmanifest',
      manifest: {
        name: 'Xenia Nessuvia',
        short_name: 'Xenia',
        display: 'standalone',
        // Baked in when the app is installed and not re-read on a palette swap, so these are the
        // Default palette's background rather than anything live. theme_color is the status bar
        // until the page loads and themeColor.ts takes over; background_color is the splash screen,
        // and is what Chrome seeds the Android navigation bar from at launch.
        theme_color: '#101014',
        background_color: '#101014',
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // The default tokenizer's BPE table is ~2 MB; the default 2 MiB cap would drop it from
        // precache, and it is the one every connection uses until told otherwise.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // cl100k is an opt-in pick, so it is fetched when chosen rather than costing every install
        // ~950 kB up front. Offline without it, counts fall back to o200k, the same thing that
        // happens for a family whose vocab has not been downloaded.
        // The NRC VAD lexicon (~900 kB) only matters once style checks are on. Offline without
        // it, scene temperature rests on the structural signals.
        globIgnores: ['**/cl100k_base-*.js', '**/vadData-*.js'],
        // The Dropbox OAuth redirect. Both spellings: Cloudflare's asset server strips the
        // extension, so the browser is redirected from /dropbox.html to /dropbox before the page
        // loads. Only the first is precached, and without this the SPA fallback answers the second
        // with index.html, booting the whole app inside the popup instead of the eight lines that
        // read the code. It looks like a sign-in that redirects and lands on Chat.
        navigateFallbackDenylist: [/^\/dropbox(\.html)?$/],
      },
    }),
  ],
  server: {
    // Dev half of the /aicc/ card download; src/index.js is the Worker half that serves a build.
    // aicharactercards.com sends no CORS header, so the browser can't fetch it directly.
    proxy: {
      '/aicc': {
        target: 'https://aicharactercards.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/aicc/, '/wp-json/pngapi/v1/image'),
      },
    },
  },
  build: {
    // Sized to clear the one chunk that is legitimately huge: the tokenizer's BPE table
    // (~2 MB, see core/prompt/budget.ts), which loads on demand and never blocks first paint.
    // Every other chunk is under 400 kB, so anything approaching this limit is a regression.
    chunkSizeWarningLimit: 2100,
    rollupOptions: {
      output: {
        // Framework in its own chunk so app edits don't re-hash it.
        manualChunks(id: string) {
          // react-dom's server renderer is not framework-on-every-page: only the chat's HTML
          // export imports it, dynamically, and folding it into vendor would put 57 kB gzipped
          // in front of every visitor. Left out so it keeps the chunk of its own that the
          // dynamic import earns it. See modules/chat/exportChat.ts.
          if (/node_modules[\/]react-dom[\/].*server/.test(id)) return
          if (/node_modules[\/](react|react-dom|react-router|react-router-dom|scheduler|dexie|zustand)[\/]/.test(id)) {
            return 'vendor'
          }
        },
      },
    },
  },
})
