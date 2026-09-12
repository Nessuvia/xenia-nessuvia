// Two sounds, synthesised rather than shipped: no audio files in the build, no new dependency, and
// nothing to load before the first card moves.
//
// The context is created on the first play. A browser refuses to start one before a user gesture,
// and a suspended context left over from page load never recovers on its own.

let context: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null
  context ??= new AudioContext()
  if (context.state === 'suspended') void context.resume()
  return context
}

/** A short filtered noise burst: a card landing on a table. */
export function cardSound() {
  const ctx = audio()
  if (!ctx) return
  const length = Math.floor(ctx.sampleRate * 0.06)
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const samples = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    // Noise under a steep decay. The square makes the tail fall away fast enough to read as a
    // flick rather than a hiss.
    const decay = (1 - i / length) ** 3
    samples[i] = (Math.random() * 2 - 1) * decay
  }
  const source = ctx.createBufferSource()
  source.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 2400
  const gain = ctx.createGain()
  gain.gain.value = 0.18
  source.connect(filter).connect(gain).connect(ctx.destination)
  source.start()
}

/** Two notes a fifth apart: a book going down. */
export function bookSound() {
  const ctx = audio()
  if (!ctx) return
  ;[660, 990].forEach((frequency, i) => {
    const osc = ctx.createOscillator()
    osc.type = 'triangle'
    osc.frequency.value = frequency
    const gain = ctx.createGain()
    const start = ctx.currentTime + i * 0.09
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22)
    osc.connect(gain).connect(ctx.destination)
    osc.start(start)
    osc.stop(start + 0.24)
  })
}
