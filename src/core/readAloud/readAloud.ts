// Read-aloud for the standalone HTML exports: two voices, one for prose and one for dialogue.
//
// Edge's own Read Aloud can't do this. It applies one user-chosen voice to the whole document and
// the page has no say in it. The Web Speech API does, and in Edge `getVoices()` includes the same
// Azure neural voices ("Microsoft Aria Online (Natural)"). The good voices are reachable from
// a file the user just opens.
//
// Dialogue is already marked in both exports' markup: `<q>` from proseHtml (story) and
// `.spokenText` from renderText (chat). Nothing here parses quotes.
//
// `splitChunks` and `pickVoices` are real functions here and reach the exported page through
// `String(fn)`: checkReadAloud.ts tests the same code the browser runs. That means they must
// stay self-contained: no imports, no module-scope references, nothing a closure would carry.

/** One chunk, as offsets into the text node it came from: it can also become a Range. */
export interface Chunk {
  start: number
  end: number
}

/**
 * Break text into utterance-sized chunks at sentence boundaries.
 *
 * Chromium truncates long utterances and the online voices time out on them: a whole paragraph
 * in one `speak()` is not safe. Greedy fill rather than one chunk per sentence: fewer utterances
 * means fewer seams between them.
 */
export function splitChunks(text: string, max = 200): Chunk[] {
  const out: Chunk[] = []
  const n = text.length
  let i = 0
  while (i < n) {
    while (i < n && /\s/.test(text.charAt(i))) i++
    if (i >= n) break
    let end = i + max
    if (end >= n) {
      end = n
    } else {
      // Back off to a sentence end, then to any space. A single unbroken run longer than max
      // gets cut mid-word, which is the only case where that is better than nothing.
      let cut = -1
      for (let j = end - 1; j > i; j--) {
        if ('.!?…'.indexOf(text.charAt(j)) >= 0) {
          let k = j + 1
          // Trailing closer belongs to the sentence that ends rather than the one that starts.
          while (k < n && '"\'”’)]'.indexOf(text.charAt(k)) >= 0) k++
          cut = k
          break
        }
      }
      if (cut < 0) {
        for (let j = end - 1; j > i; j--) {
          if (/\s/.test(text.charAt(j))) {
            cut = j
            break
          }
        }
      }
      if (cut > i && cut < end) end = cut
    }
    out.push({ start: i, end })
    i = end
  }
  return out
}

/** The parts of `SpeechSynthesisVoice` this picks on. */
export interface VoiceLike {
  name: string
  lang: string
  localService: boolean
}

/**
 * Default voices for prose and dialogue, best available first.
 *
 * Online first: that is where the difference is audible. Edge's Natural voices, then any
 * other remote voice, then the local ones (David, Zira) that are all an offline reader gets. When
 * the pool holds a single voice both names come back the same and the caller shifts pitch instead.
 */
export function pickVoices(
  voices: VoiceLike[],
  lang: string,
): { narrator: string; dialogue: string } {
  const base = (lang || 'en').slice(0, 2).toLowerCase()
  let pool = voices.filter((v) => v.lang.slice(0, 2).toLowerCase() === base)
  if (!pool.length) pool = voices.slice()
  const rank = (v: VoiceLike) => (/natural/i.test(v.name) ? 0 : v.localService === false ? 1 : 2)
  pool = pool.slice().sort((a, b) => rank(a) - rank(b))
  const narrator = pool.length ? pool[0].name : ''
  let dialogue = narrator
  for (const v of pool) {
    if (v.name !== narrator) {
      dialogue = v.name
      break
    }
  }
  return { narrator, dialogue }
}

/** The toolbar, hidden until the script confirms `speechSynthesis` exists. */
export const readAloudBar = `<div class="readAloud" id="readAloud" hidden>
<button type="button" data-act="play">Read aloud</button>
<button type="button" data-act="pause">Pause</button>
<button type="button" data-act="stop">Stop</button>
<label>Narrator <select data-voice="narrator"></select></label>
<label>Dialogue <select data-voice="dialogue"></select></label>
</div>`

/** Styles for the toolbar and the spoken-chunk highlight. Interpolated into each export's CSS. */
export const readAloudCss = `.readAloud {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.6rem;
  margin: 0 0 1.5rem;
  font-size: 0.85em;
}
.readAloud button {
  padding: 0.2em 0.7em;
  background: var(--panel, transparent);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--textSoft, inherit);
  font: inherit;
  cursor: pointer;
}
.readAloud button:hover { color: var(--accent); }
.readAloud button[disabled] { opacity: 0.5; cursor: default; }
.readAloud label { color: var(--textMuted, inherit); }
.readAloud select {
  max-width: 14rem;
  padding: 0.2em 0.4em;
  background: var(--panel, transparent);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--textSoft, inherit);
  font: inherit;
}
::highlight(readAloud) { background: var(--accent); color: var(--bg); }`

/**
 * The browser half. Kept as a string: it ships inside an exported file rather than running
 * in the app. The two pure helpers above are injected: there is one copy of that logic.
 *
 * `skipSelector` is the export's own furniture (its nav, its collapsed think blocks) that should
 * not be read.
 */
export function readAloudScript(skipSelector: string): string {
  return `${String(splitChunks)}
${String(pickVoices)}
(function () {
  var synth = window.speechSynthesis
  var bar = document.getElementById('readAloud')
  if (!synth || !bar) return
  bar.hidden = false

  var SKIP = ${JSON.stringify(skipSelector)}
  var DIALOGUE = 'q, .spokenText'
  var play = bar.querySelector('[data-act=play]')
  var pause = bar.querySelector('[data-act=pause]')
  var stop = bar.querySelector('[data-act=stop]')
  var picks = { narrator: bar.querySelector('[data-voice=narrator]'), dialogue: bar.querySelector('[data-voice=dialogue]') }
  var voices = []
  var byName = {}

  // Text nodes in document order, each tagged with which voice reads it. Built once on play:
  // nothing in these files mutates after load except <details> opening, which does not move text.
  function collect() {
    var runs = []
    var walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT
        var p = n.parentElement
        if (!p || p.closest(SKIP)) return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      },
    })
    for (var n = walk.nextNode(); n; n = walk.nextNode()) {
      var kind = n.parentElement.closest(DIALOGUE) ? 'dialogue' : 'narrator'
      var chunks = splitChunks(n.nodeValue)
      for (var i = 0; i < chunks.length; i++) {
        runs.push({ node: n, start: chunks[i].start, end: chunks[i].end, kind: kind })
      }
    }
    return runs
  }

  // The Custom Highlight API paints the current chunk without touching the DOM. Absent in older
  // browsers, in which case reading works and nothing lights up.
  var canMark = typeof Highlight === 'function' && window.CSS && CSS.highlights
  function mark(run) {
    if (!canMark) return
    if (!run) { CSS.highlights.delete('readAloud'); return }
    var r = document.createRange()
    r.setStart(run.node, run.start)
    r.setEnd(run.node, run.end)
    CSS.highlights.set('readAloud', new Highlight(r))
    var el = run.node.parentElement
    var box = el.getBoundingClientRect()
    if (box.top < 60 || box.bottom > innerHeight - 40) el.scrollIntoView({ block: 'center' })
  }

  function fillPicks() {
    voices = synth.getVoices()
    byName = {}
    for (var i = 0; i < voices.length; i++) byName[voices[i].name] = voices[i]
    var want = pickVoices(voices, document.documentElement.lang || 'en')
    ;['narrator', 'dialogue'].forEach(function (role) {
      var sel = picks[role]
      var had = sel.value
      sel.textContent = ''
      voices.forEach(function (v) {
        var o = document.createElement('option')
        o.value = v.name
        o.textContent = v.name + (v.localService ? '' : ' (online)')
        sel.appendChild(o)
      })
      sel.value = byName[had] ? had : want[role]
    })
  }
  fillPicks()
  // The list arrives async on first load, and again when the online set resolves.
  synth.addEventListener('voiceschanged', fillPicks)

  function speak() {
    synth.cancel()
    var runs = collect()
    // Same voice for both roles means one voice was all there was; pitch is the only split left.
    var same = picks.narrator.value === picks.dialogue.value
    runs.forEach(function (run, i) {
      var u = new SpeechSynthesisUtterance(run.node.nodeValue.slice(run.start, run.end))
      u.voice = byName[picks[run.kind].value] || null
      if (same && run.kind === 'dialogue') u.pitch = 1.25
      u.onstart = function () { mark(run) }
      if (i === runs.length - 1) u.onend = function () { mark(null); state('idle') }
      synth.speak(u)
    })
    if (!runs.length) return
    state('playing')
  }

  function state(s) {
    play.textContent = s === 'idle' ? 'Read aloud' : 'Restart'
    pause.textContent = s === 'paused' ? 'Resume' : 'Pause'
    pause.disabled = s === 'idle'
    stop.disabled = s === 'idle'
  }

  play.addEventListener('click', speak)
  pause.addEventListener('click', function () {
    // Chromium's pause() is unreliable on the online voices; Stop and Read aloud always work.
    if (synth.paused) { synth.resume(); state('playing') } else { synth.pause(); state('paused') }
  })
  stop.addEventListener('click', function () {
    synth.cancel()
    mark(null)
    state('idle')
  })
  // A queue left running survives navigation in some builds.
  addEventListener('pagehide', function () { synth.cancel() })
  state('idle')
})()`
}
