// Run: node --experimental-strip-types src/core/palette/checkPalette.ts
import assert from 'node:assert'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  backgroundSlots,
  changedFields,
  defaultPalette,
  appFontMatched,
  effectiveAppFont,
  effectiveFont,
  matchAppFontPatch,
  fitStyle,
  isLight,
  nextOrder,
  normalizeBackgrounds,
  normalizeSkinVars,
  paletteVars,
  resolveBackground,
  resolvePalette,
  rootVarFields,
  sortByOrder,
  type Palette,
} from './palette.ts'
import {
  buildPaletteFile,
  coerceFields,
  fileName,
  parsePalettes,
  remapImages,
} from './importPalettes.ts'
import { fallbackBg, systemBars } from './themeColor.ts'
import { skinVars } from '../../app/skins/skins.ts'
import {
  buildPaletteMessages,
  defaultPalettePrompt,
  modeLadder,
  paletteSchema,
  parsePaletteReply,
  responseFormat,
} from './palettePrompt.ts'

// --- resolvePalette fills gaps from Default -------------------------------
const partial = resolvePalette({ name: 'Half', bg: '#000000' })
assert.strictEqual(partial.bg, '#000000')
assert.strictEqual(partial.name, 'Half')
assert.strictEqual(partial.accent, defaultPalette.accent)
assert.strictEqual(partial.radius, defaultPalette.radius)
assert.deepStrictEqual(partial.colorOrder, ['emphasis', 'bold', 'quotes'])
// Nothing at all still resolves to Default.
assert.deepStrictEqual(resolvePalette(), defaultPalette)
assert.deepStrictEqual(resolvePalette(null), defaultPalette)

// A partial or junk order keeps every kind exactly once, order kept.
assert.deepStrictEqual(resolvePalette({ colorOrder: ['quotes'] as never }).colorOrder, [
  'quotes',
  'emphasis',
  'bold',
])
assert.deepStrictEqual(resolvePalette({ colorOrder: ['nope', 'bold', 'bold'] as never }).colorOrder, [
  'bold',
  'emphasis',
  'quotes',
])

// --- webfont fields -------------------------------------------------------
// Defaults: webfont off, no family, no id.
assert.strictEqual(defaultPalette.useWebfont, false)
assert.strictEqual(defaultPalette.webfont, '')
assert.strictEqual(defaultPalette.webfontId, '')
// resolvePalette merges them; partial rows fill from Default.
assert.strictEqual(resolvePalette({ useWebfont: true }).useWebfont, true)
assert.strictEqual(resolvePalette({ webfont: 'Roboto' }).webfont, 'Roboto')
assert.strictEqual(resolvePalette({ webfontId: 'roboto' }).webfontId, 'roboto')

// effectiveFont / paletteVars: webfont overrides the stack while on; off falls back to fontFamily.
assert.strictEqual(effectiveFont(resolvePalette({ fontFamily: 'Georgia, serif' })), 'Georgia, serif')
assert.strictEqual(
  effectiveFont(resolvePalette({ useWebfont: true, webfont: 'Roboto', fontFamily: 'Georgia, serif' })),
  '"Roboto", sans-serif',
)
// A webfont with no family name (cleared mid-edit) falls back to the stack, not to an empty string.
assert.strictEqual(
  effectiveFont(resolvePalette({ useWebfont: true, webfont: '', fontFamily: 'Georgia, serif' })),
  'Georgia, serif',
)
const webfontVars = paletteVars(resolvePalette({ useWebfont: true, webfont: 'ABeeZee', webfontId: 'abeezee' }))
assert.strictEqual(webfontVars['--chatFont'], '"ABeeZee", sans-serif')
const stackVars = paletteVars(resolvePalette({ fontFamily: 'Georgia, serif' }))
assert.strictEqual(stackVars['--chatFont'], 'Georgia, serif')

// The app font is the same shape on its own four fields, and must not move with the chat font.
assert.strictEqual(defaultPalette.useAppWebfont, false)
assert.strictEqual(defaultPalette.appFontFamily, '')
assert.strictEqual(effectiveAppFont(resolvePalette({ appFontFamily: 'Georgia, serif' })), 'Georgia, serif')
assert.strictEqual(
  effectiveAppFont(resolvePalette({ useAppWebfont: true, appWebfont: 'Roboto', appFontFamily: 'Georgia, serif' })),
  '"Roboto", sans-serif',
)
assert.strictEqual(
  effectiveAppFont(resolvePalette({ useAppWebfont: true, appWebfont: '', appFontFamily: 'Georgia, serif' })),
  'Georgia, serif',
)
const splitVars = paletteVars(resolvePalette({ fontFamily: 'Georgia, serif', appFontFamily: 'ui-monospace, monospace' }))
assert.strictEqual(splitVars['--chatFont'], 'Georgia, serif')
assert.strictEqual(splitVars['--appFont'], 'ui-monospace, monospace')
// Turning on the chat webfont leaves the app font alone.
assert.strictEqual(webfontVars['--appFont'], '')

// The match toggle: on copies the chat font over, off must always leave the two unmatched. The
// checkbox is derived from the fields: a no-op "off" would stick on forever.
const georgia = resolvePalette({ fontFamily: 'Georgia, serif' })
assert.strictEqual(appFontMatched(georgia), false)
assert.strictEqual(appFontMatched(resolvePalette({ ...georgia, ...matchAppFontPatch(georgia, true) })), true)
assert.strictEqual(appFontMatched(resolvePalette({ ...georgia, ...matchAppFontPatch(georgia, false) })), false)
// A webfont match copies all four fields, and unmatching breaks it.
const roboto = resolvePalette({ useWebfont: true, webfont: 'Roboto', webfontId: 'roboto' })
const linked = resolvePalette({ ...roboto, ...matchAppFontPatch(roboto, true) })
assert.strictEqual(appFontMatched(linked), true)
assert.strictEqual(effectiveAppFont(linked), '"Roboto", sans-serif')
assert.strictEqual(appFontMatched(resolvePalette({ ...linked, ...matchAppFontPatch(linked, false) })), false)
// The default palette starts matched (both fonts empty); turning the toggle off there still has to
// produce an unmatched pair: that's why the patch falls to the named stack rather than ''.
const fresh = resolvePalette({})
assert.strictEqual(appFontMatched(fresh), true)
assert.strictEqual(appFontMatched(resolvePalette({ ...fresh, ...matchAppFontPatch(fresh, false) })), false)

// textWeight: emitted as a bare number string, and never empty. An unset weight means 400, not a
// dropped var: :root's fallback is the same value either way.
assert.strictEqual(paletteVars(resolvePalette({ textWeight: 600 }))['--textWeight'], '600')
assert.strictEqual(paletteVars(resolvePalette({}))['--textWeight'], '400')
assert.strictEqual(paletteVars(resolvePalette({ textWeight: 0 }))['--textWeight'], '400')

// --- paletteVars emits every root var -------------------------------------
const vars = paletteVars(defaultPalette)
for (const field of rootVarFields) {
  assert.strictEqual(vars[`--${field}`], defaultPalette[field], `missing --${field}`)
}
assert.strictEqual(vars['--radius'], '6px')
// A cleared color is left out: the :root fallback shows through.
assert.ok(!('--accent' in paletteVars(resolvePalette({ accent: '' }))))

// --- color-scheme is derived from the background --------------------------
assert.strictEqual(vars['--colorScheme'], 'dark')
assert.strictEqual(paletteVars(resolvePalette({ bg: '#f2f2f5' }))['--colorScheme'], 'light')
assert.ok(isLight('#ffffff'))
assert.ok(isLight('#fff')) // short form
assert.ok(!isLight('#101014'))
assert.ok(!isLight('')) // a cleared or unparseable color counts as dark

// --- the fallback constant is a complete palette ---------------------------
assert.strictEqual(defaultPalette.id, undefined) // seeded as a new row, never with a fixed id
for (const field of rootVarFields) assert.ok(defaultPalette[field], `default palette missing ${field}`)

// --- importPalettes -------------------------------------------------------
assert.throws(() => parsePalettes(JSON.stringify({ format: 'nope', palettes: [] })), /Not a palette/)
assert.throws(() => parsePalettes(JSON.stringify({ format: 'nessuTavern.palettes' })), /Not a palette/)

// Garbage field types fall back to the Default value, field by field.
const junk = parsePalettes(
  JSON.stringify({
    format: 'nessuTavern.palettes',
    version: 1,
    palettes: [{ name: 'Junk', bg: 42, fontSize: 'big', radius: 12, colorOrder: 'bold', extra: 1 }],
  }),
).palettes
assert.strictEqual(junk.length, 1)
assert.strictEqual(junk[0].name, 'Junk')
assert.strictEqual(junk[0].bg, defaultPalette.bg) // number where a color belongs
assert.strictEqual(junk[0].fontSize, defaultPalette.fontSize) // string where a number belongs
assert.strictEqual(junk[0].radius, 12) // a good value survives
assert.deepStrictEqual(junk[0].colorOrder, defaultPalette.colorOrder)
assert.ok(!('extra' in junk[0])) // unknown keys are dropped
assert.strictEqual(junk[0].id, undefined) // ids never come in from a file

// An unnamed palette still gets a name.
assert.strictEqual(
  parsePalettes(JSON.stringify({ format: 'nessuTavern.palettes', palettes: [{}] })).palettes[0]
    .name,
  'Default', // the Default constant's name is the fallback for a missing one
)

// --- an export round-trips ------------------------------------------------
const mine = resolvePalette({ id: 3, name: 'Mine', bg: '#123456', radius: 10 })
const back = parsePalettes(JSON.stringify(buildPaletteFile([mine]))).palettes[0]
assert.strictEqual(back.name, 'Mine')
assert.strictEqual(back.bg, '#123456')
assert.strictEqual(back.radius, 10)
assert.strictEqual(back.id, undefined)
assert.deepStrictEqual({ ...back, id: 3 }, { ...mine, ownerId: back.ownerId })

// Every field type survives the trip, not just the strings and numbers: booleans and the skin knobs
// used to land in the string branch and silently reset to Default.
const everything = resolvePalette({
  id: 9,
  name: 'Everything',
  overwriteCharColor: true,
  useWebfont: true,
  webfont: 'Inter',
  webfontId: 'inter',
  skin: 'glass',
  skinVars: { '--glassBlur': 4 },
  colorOrder: ['bold', 'quotes', 'emphasis'],
  backgrounds: { chat: { imageId: 5, css: 'div { opacity: .5 }', html: '<div></div>' } } as never,
})
const trip = parsePalettes(JSON.stringify(buildPaletteFile([everything]))).palettes[0]
assert.deepStrictEqual({ ...trip, id: 9 }, { ...everything, ownerId: trip.ownerId })

// A boolean from a file is a boolean or it is the fallback. A truthy string is not a yes.
const lied = parsePalettes(
  JSON.stringify({
    format: 'nessuTavern.palettes',
    palettes: [{ useWebfont: 'true', overwriteCharColor: 1, skinVars: { blur: 4, '--x': 'no' } }],
  }),
).palettes[0]
assert.strictEqual(lied.useWebfont, false)
assert.strictEqual(lied.overwriteCharColor, false)
assert.deepStrictEqual(lied.skinVars, {}) // neither key is a finite number under a `--` name

// An element that isn't an object is a Default palette, not a crash.
assert.strictEqual(
  parsePalettes(JSON.stringify({ format: 'nessuTavern.palettes', palettes: [null] })).palettes
    .length,
  1,
)

// --- images travel with the palette ---------------------------------------
const withImage = resolvePalette({
  name: 'Imaged',
  backgrounds: { all: { imageId: 5 }, chat: { imageId: 7 } } as never,
})
const library = [
  { id: 5, name: 'a.png', dataUrl: 'data:image/png;base64,AAA' },
  { id: 7, name: 'b.png', dataUrl: 'data:image/png;base64,BBB' },
  { id: 9, name: 'unused.png', dataUrl: 'data:image/png;base64,CCC' },
]
const imaged = buildPaletteFile([withImage], library)
assert.deepStrictEqual(Object.keys(imaged.images ?? {}), ['5', '7']) // only what's referenced
const parsedImages = parsePalettes(JSON.stringify(imaged))
assert.strictEqual(parsedImages.images[5].dataUrl, 'data:image/png;base64,AAA')

// The importer's map rewrites the ids; anything it doesn't cover means no image.
const remapped = remapImages(parsedImages.palettes[0], { 5: 20 })
assert.strictEqual(remapped.backgrounds.all.imageId, 20)
assert.strictEqual(remapped.backgrounds.chat.imageId, 0) // 7 was not in the map
assert.strictEqual(remapped.backgrounds.write.imageId, 0) // never had one

// A file from before images were carried still parses, and its ids remap to nothing.
const old = parsePalettes(
  JSON.stringify({ format: 'nessuTavern.palettes', version: 1, palettes: [withImage] }),
)
assert.deepStrictEqual(old.images, {})
assert.strictEqual(remapImages(old.palettes[0], {}).backgrounds.all.imageId, 0)

// Junk in the images map is dropped rather than stored.
assert.deepStrictEqual(
  parsePalettes(
    JSON.stringify({
      format: 'nessuTavern.palettes',
      palettes: [],
      images: { 0: { dataUrl: 'x' }, 3: { dataUrl: '' }, 4: null, 5: { dataUrl: 'ok' } },
    }),
  ).images,
  { 5: { name: 'Imported image', dataUrl: 'ok' } },
)

// --- the generated reply --------------------------------------------------
const base = resolvePalette({ id: 7, name: 'Base', bg: '#111111', accent: '#222222', radius: 3 })

// Fenced, which is what most models do despite being asked not to.
const fenced = parsePaletteReply('Here you go:\n```json\n{"bg":"#fff8ec","name":"Dune"}\n```\n', base)
assert.strictEqual(fenced.bg, '#fff8ec')
assert.strictEqual(fenced.name, 'Dune')
// Untouched fields keep the base's value, not Default's.
assert.strictEqual(fenced.accent, '#222222')
assert.strictEqual(fenced.radius, 3)
assert.strictEqual(fenced.id, undefined) // the row's identity never comes from a reply

// Wrapped in prose, with a nested object and a brace inside a string.
const wrapped = parsePaletteReply(
  'I went warm. {"name":"A { brace }","bg":"#ffffff","extra":{"nope":1}} Hope that works!',
  base,
)
assert.strictEqual(wrapped.name, 'A { brace }')
assert.strictEqual(wrapped.bg, '#ffffff')

// Junk values fall back to the base, field by field, and a blank name keeps the old one.
const sloppy = parsePaletteReply('{"bg":404,"fontSize":"large","name":"  ","radius":9}', base)
assert.strictEqual(sloppy.bg, base.bg)
assert.strictEqual(sloppy.fontSize, base.fontSize)
assert.strictEqual(sloppy.name, 'Base')
assert.strictEqual(sloppy.radius, 9)

// Each way a reply can fail says which way it was: the panel isn't one message for everything.
assert.throws(() => parsePaletteReply('I cannot help with that.', base), /no JSON object/)
assert.throws(() => parsePaletteReply('{"bg": #fff}', base), /did not parse/)
assert.throws(() => parsePaletteReply('{"bg":"#fff","accent":', base), /cut off/)
assert.throws(() => parsePaletteReply('', base), /no JSON object/)
// The object is cut out of the text: a reply that leads with an array still yields its object.
assert.strictEqual(parsePaletteReply('[{"bg":"#fff"}]', base).bg, '#fff')

// coerceFields is the same code both callers use: base Default matches the import path.
assert.deepStrictEqual(
  coerceFields({ bg: '#abcdef' }, defaultPalette).bg,
  parsePalettes(
    JSON.stringify({ format: 'nessuTavern.palettes', palettes: [{ bg: '#abcdef' }] }),
  ).palettes[0].bg,
)

// --- the request ----------------------------------------------------------
const messages = buildPaletteMessages('', 'warm autumn', base)
assert.strictEqual(messages.length, 2)
assert.strictEqual(messages[0].role, 'system')
assert.strictEqual(messages[0].content, defaultPalettePrompt) // '' means the built-in
assert.strictEqual(buildPaletteMessages('mine', '', base)[0].content, 'mine')
assert.match(messages[1].content, /warm autumn/)
assert.match(messages[1].content, /#111111/) // the current scheme goes along for "make it warmer"
assert.ok(!messages[1].content.includes('"id"')) // no row identity in the prompt

// --- structured output ----------------------------------------------------
// The ladder starts where the connection left off and only ever walks down.
assert.deepStrictEqual(modeLadder(), ['schema', 'object', 'none'])
assert.deepStrictEqual(modeLadder('schema'), ['schema', 'object', 'none'])
assert.deepStrictEqual(modeLadder('object'), ['object', 'none'])
assert.deepStrictEqual(modeLadder('none'), ['none'])
assert.deepStrictEqual(modeLadder('junk' as never), ['schema', 'object', 'none']) // stale value

// The bottom rung sends no response_format at all.
assert.deepStrictEqual(responseFormat('none'), {})
assert.deepStrictEqual(responseFormat('object'), { response_format: { type: 'json_object' } })

// The schema covers every palette field and nothing else, and carries no value constraints.
const schema = paletteSchema()
const props = schema.properties as Record<string, { type: string }>
// backgrounds is deliberately not in the schema: image references and raw CSS are not the model's
// to invent, and a nested object is what a strict backend refuses.
const paletteFields = Object.keys(defaultPalette).filter(
  (k) =>
    ![
      'id',
      'ownerId',
      'backgrounds',
      'webfont',
      'webfontId',
      'useWebfont',
      'appWebfont',
      'appWebfontId',
      'useAppWebfont',
      'skin',
      'skinVars',
    ].includes(k),
)
// No bare `{type:'object'}` property: a strict backend either rejects it or builds a grammar that
// can emit nothing, which showed up as an empty reply.
assert.ok(!Object.values(props).some((p) => p.type === 'object'))
assert.ok(!('backgrounds' in props))
assert.ok(!buildPaletteMessages('', 'x', resolvePalette({})) [1].content.includes('backgrounds'))
assert.deepStrictEqual(Object.keys(props).sort(), paletteFields.sort())
assert.deepStrictEqual((schema.required as string[]).sort(), paletteFields.sort())
assert.strictEqual(schema.additionalProperties, false)
assert.strictEqual(props.bg.type, 'string')
assert.strictEqual(props.radius.type, 'number')
assert.strictEqual(props.colorOrder.type, 'array')
// Shape only: a pattern or a range here is what a strict backend refuses.
assert.ok(!JSON.stringify(schema).includes('pattern'))
assert.ok(!JSON.stringify(schema).includes('minimum'))

// A schema reply still goes through coercion. Structured output is not a reason to trust it.
assert.strictEqual(parsePaletteReply('{"bg":null,"radius":"6"}', base).bg, base.bg)

// --- rewind diffing -------------------------------------------------------
assert.deepStrictEqual(changedFields(base, base), [])
assert.deepStrictEqual(changedFields(base, { ...base, bg: '#000000' }), ['bg'])
// Identity is not appearance.
assert.deepStrictEqual(changedFields(base, { ...base, id: 99, ownerId: 'other' }), [])
// Orders compare by contents, not by reference.
assert.deepStrictEqual(changedFields(base, { ...base, colorOrder: [...base.colorOrder] }), [])
assert.deepStrictEqual(
  changedFields(base, { ...base, colorOrder: ['bold', 'emphasis', 'quotes'] }),
  ['colorOrder'],
)
// Everything a full reply changed is reported: nothing is left without a rewind.
assert.deepStrictEqual(changedFields(base, parsePaletteReply('{"bg":"#fff","radius":12}', base)), [
  'bg',
  'radius',
])

// --- backgrounds ----------------------------------------------------------
// Every slot resolves, whatever the row held.
assert.deepStrictEqual(Object.keys(resolvePalette({}).backgrounds).sort(), [...backgroundSlots].sort())
const partialBg = resolvePalette({
  backgrounds: { chat: { imageId: 4, fit: 'tile' } } as never,
})
assert.strictEqual(partialBg.backgrounds.chat.imageId, 4)
assert.strictEqual(partialBg.backgrounds.chat.fit, 'tile')
assert.strictEqual(partialBg.backgrounds.chat.css, '') // filled in
assert.strictEqual(partialBg.backgrounds.chat.html, '') // filled in
assert.strictEqual(partialBg.backgrounds.write.imageId, 0) // a slot the row never had
// Junk in a slot falls back field by field, the same as everywhere else.
const junkBg = normalizeBackgrounds({ all: { imageId: 'four', fit: 'wobble', url: 7 } } as never)
assert.strictEqual(junkBg.all.imageId, 0)
assert.strictEqual(junkBg.all.fit, 'cover')
assert.strictEqual(junkBg.all.url, '')

// A page with no image of its own shows the baseline's image and the baseline's fit.
const bgs = normalizeBackgrounds({
  all: { imageId: 1, fit: 'contain', css: 'a{}', html: '<div class="a"></div>' },
  chat: { url: 'https://x/y.png', fit: 'tile', css: 'b{}', html: '<div class="b"></div>' },
  write: { fit: 'stretch' },
} as never)
assert.deepStrictEqual(resolveBackground(bgs, 'chat'), {
  imageId: 0,
  url: 'https://x/y.png',
  fit: 'tile',
  excludeNav: false,
  css: 'b{}', // the page's own replaces the baseline's rather than stacking on it
  html: '<div class="b"></div>',
})
// CSS and HTML fall back independently: only CSS set here. The baseline's elements still render.
const cssOnly = normalizeBackgrounds({
  all: { css: 'a{}', html: '<div class="a"></div>' },
  chat: { css: 'b{}' },
} as never)
assert.strictEqual(resolveBackground(cssOnly, 'chat').css, 'b{}')
assert.strictEqual(resolveBackground(cssOnly, 'chat').html, '<div class="a"></div>')
// excludeNav is layer geometry: a slot with only css of its own still sets its own box.
const navBgs = normalizeBackgrounds({
  all: { imageId: 1, excludeNav: true },
  chat: { css: 'b{}' },
  write: { imageId: 2, excludeNav: false },
} as never)
assert.strictEqual(resolveBackground(navBgs, 'chat').excludeNav, false)
assert.strictEqual(resolveBackground(navBgs, 'prompts').excludeNav, true)
assert.strictEqual(resolveBackground(navBgs, 'write').excludeNav, false)
assert.deepStrictEqual(resolveBackground(bgs, 'write'), {
  imageId: 1,
  url: '',
  fit: 'contain', // its own 'stretch' is ignored: the image it shows is the baseline's
  excludeNav: false,
  css: 'a{}',
  html: '<div class="a"></div>', // the page has none of its own: just the baseline's
})
assert.strictEqual(resolveBackground(bgs, 'all').css, 'a{}') // the baseline never doubles itself
assert.strictEqual(resolveBackground(bgs, 'all').html, '<div class="a"></div>')
assert.strictEqual(resolveBackground(normalizeBackgrounds(), 'prompts').css, '')
assert.strictEqual(resolveBackground(normalizeBackgrounds(), 'prompts').html, '')

// Fit modes. Every one centers; the size and the repeat are what differ.
const sized: [Parameters<typeof fitStyle>[0], string, string][] = [
  ['cover', 'cover', 'no-repeat'],
  ['contain', 'contain', 'no-repeat'],
  ['center', 'auto', 'no-repeat'],
  ['stretch', '100% 100%', 'no-repeat'],
  ['tile', 'auto', 'repeat'],
  ['none', 'auto', 'no-repeat'],
]
for (const [fit, size, repeat] of sized) {
  assert.deepStrictEqual(fitStyle(fit), {
    backgroundSize: size,
    backgroundRepeat: repeat,
    backgroundPosition: 'center',
  })
}

// Rewind: the object is rebuilt on every resolve. It must compare by contents.
const withBg = resolvePalette({ id: 1, backgrounds: { chat: { imageId: 2 } } as never })
assert.deepStrictEqual(changedFields(withBg, resolvePalette(withBg)), [])
assert.deepStrictEqual(
  changedFields(withBg, resolvePalette({ ...withBg, backgrounds: normalizeBackgrounds() })),
  ['backgrounds'],
)

// An export carries them; a model reply leaves them alone.
const bgExport = parsePalettes(JSON.stringify(buildPaletteFile([withBg]))).palettes[0]
assert.strictEqual(bgExport.backgrounds.chat.imageId, 2)
assert.strictEqual(parsePaletteReply('{"bg":"#fff"}', withBg).backgrounds.chat.imageId, 2)

// Structure: a row written before skins existed resolves to no skin, and a model cannot change it.
assert.strictEqual(resolvePalette({ bg: '#000' }).skin, 'default')
assert.deepStrictEqual(resolvePalette({ bg: '#000' }).skinVars, {})
const glassy = resolvePalette({ ...defaultPalette, skin: 'glass', skinVars: { '--glassBlur': 4 } })
const replied = parsePaletteReply('{"bg":"#fff","skin":"default","skinVars":{}}', glassy)
assert.strictEqual(replied.skin, 'glass')
assert.deepStrictEqual(replied.skinVars, { '--glassBlur': 4 })

// Knob values reach a `style.setProperty` call: only finite numbers under a `--` key survive.
assert.deepStrictEqual(
  normalizeSkinVars({ '--glassBlur': 8, '--bad': 'url(x)', glassTint: 4, '--nan': NaN, '--n': null }),
  { '--glassBlur': 8 },
)
assert.deepStrictEqual(normalizeSkinVars('nope'), {})

// A knob clamps its own range, and a knob the palette has no number for is left to the stylesheet.
assert.deepStrictEqual(skinVars('glass', { '--glassBlur': 999 }), { '--glassBlur': '40px' })
assert.deepStrictEqual(skinVars('glass', {}), {})
assert.deepStrictEqual(skinVars('default', { '--glassBlur': 8 }), {})
assert.deepStrictEqual(skinVars('nosuchskin', { '--glassBlur': 8 }), {})

// Export filename: spaces to underscores, path characters dropped, empty falls back.
assert.strictEqual(fileName(' Deep  Sea / v2 '), 'Deep_Sea_v2')
assert.strictEqual(fileName('  '), 'palette')

// --- the system bars follow the background --------------------------------
// A dark background gets a light-on-black iOS bar, a light one gets the dark-text default.
assert.deepStrictEqual(systemBars('#101014'), { themeColor: '#101014', iosStatusBarStyle: 'black' })
assert.deepStrictEqual(systemBars('#f2f2f5'), { themeColor: '#f2f2f5', iosStatusBarStyle: 'default' })
assert.deepStrictEqual(systemBars('#fff'), { themeColor: '#fff', iosStatusBarStyle: 'default' })
assert.strictEqual(systemBars('  #FFF  ').themeColor, '#FFF') // trimmed, case kept
// The theme-color meta takes a color. A value that isn't one falls back to the stylesheet's
// background rather than reaching the tag. An ignored tag would leave the last palette's bar up.
for (const junk of ['', 'red', 'rgb(0,0,0)', '#12345', '101014', '#gggggg']) {
  assert.strictEqual(systemBars(junk).themeColor, fallbackBg, `${junk} should fall back`)
}
// The fallback is the :root value in index.css, and the Default palette agrees with it.
assert.strictEqual(fallbackBg, defaultPalette.bg)

// --- the bundled files ----------------------------------------------------
// bundledPalettes() can't run here (import.meta.glob is Vite's), but it parses these files exactly
// the way this does. Seeding and the Bundled picker both read the result, and the picker lists them
// by name. A file that doesn't parse takes the whole panel down with it.
const bundledDir = join(dirname(fileURLToPath(import.meta.url)), 'bundled')
const bundledFiles = readdirSync(bundledDir).filter((f) => f.endsWith('.json'))
assert.ok(bundledFiles.length > 0, 'no bundled palettes')
for (const file of bundledFiles) {
  const { palettes: rows } = parsePalettes(readFileSync(join(bundledDir, file), 'utf8'))
  assert.ok(rows.length > 0, `${file} holds no palette`)
  for (const row of rows) assert.ok(row.name.trim(), `${file} has an unnamed palette`)
}

// --- list order -----------------------------------------------------------
const row = (id: number, orderId?: number) => ({ ...defaultPalette, id, orderId })
const names = (rows: Palette[]) => rows.map((p) => p.id)

assert.deepStrictEqual(names(sortByOrder([row(3, 2), row(1, 0), row(2, 1)])), [1, 2, 3])
// Rows written before the field existed keep the table's own order, after the ordered ones.
assert.deepStrictEqual(names(sortByOrder([row(9), row(4, 1), row(7), row(5, 0)])), [5, 4, 7, 9])
// Two rows on the same number break the tie on id rather than on read order.
assert.deepStrictEqual(names(sortByOrder([row(8, 0), row(2, 0)])), [2, 8])
// Sorting doesn't touch the array it was given.
const unsorted = [row(2, 1), row(1, 0)]
sortByOrder(unsorted)
assert.deepStrictEqual(names(unsorted), [2, 1])

assert.strictEqual(nextOrder([]), 0)
assert.strictEqual(nextOrder([row(1, 0), row(2, 4), row(3, 2)]), 5)
// A list of nothing but pre-field rows still appends at 0: they sort last anyway.
assert.strictEqual(nextOrder([row(1), row(2)]), 0)

console.log('checkPalette ok')
