// Static hosting plus one route. The app has no backend: sync goes from the browser straight to
// the user's own Dropbox, and multiplayer goes straight to the relay the host runs. Nothing of
// anyone's is stored on our side.
//
// The one exception is /aicc/, which forwards a card download to aicharactercards.com. That API
// sends no Access-Control-Allow-Origin, so the browser can't read it directly and something has to
// front it. Nothing is stored or logged here; the response is the PNG and nothing else.
//
// Named environments inherit top-level "main", so env.dev needs its own entry point, otherwise
// dev would deploy the coming-soon page. Assets apply not_found_handling:
// single-page-application on a miss, which is what serves the SPA fallback.

// A path segment we're willing to paste into an outbound URL. core/connectors/fetchCard.ts checks
// the same thing client-side; this is the one that matters, since the request is user-driven.
const segment = /^(?!\.\.?$)[\w.-]+$/

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (pathname.startsWith('/aicc/')) {
      const parts = pathname.slice('/aicc/'.length).split('/')
      if (parts.length !== 2 || !parts.every((p) => segment.test(p))) {
        return new Response('Bad card id', { status: 400 })
      }
      const upstream = await fetch(
        `https://aicharactercards.com/wp-json/pngapi/v1/image/${parts[0]}/${parts[1]}`,
      )
      if (!upstream.ok) return new Response('Card not found', { status: upstream.status })
      // Rebuilt rather than passed through, so no upstream header (cookies, content-disposition)
      // reaches the browser.
      return new Response(upstream.body, { headers: { 'content-type': 'image/png' } })
    }
    return env.ASSETS.fetch(request)
  },
}
