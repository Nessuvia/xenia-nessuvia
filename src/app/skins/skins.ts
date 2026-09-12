/**
 * The structural half of a palette. Colors come from the palette's own vars; a skin decides how the
 * app's surfaces are built out of them: translucency, blur, borders, shadows.
 *
 * Applied as `data-skin` on the root element: a skin's stylesheet is a block of
 * `[data-skin='glass'] #root .panel { … }` rules and nothing else. Four classes are the whole
 * contract:
 *
 *   panel   a bordered surface region: side panels, settings panes, section bodies, dialogs
 *   navbar  nav chrome: the sidebar rail, module bars, tab strips
 *   card    a repeated list item: character tiles, chat rows, persona rows
 *   bubble  a chat message
 *
 * A skin may reach past those four where a surface has a shape the class alone can't express. Glass
 * names `.navbar.sidebar` to turn the rail's shadow and hairlines onto the vertical axis. Keep such
 * rules rare and commented; a skin that lists module classes has stopped being a skin.
 *
 * A skin may only change how a surface is painted: background, border, shadow, filters. Radius,
 * padding and spacing stay in the base stylesheet. A skin can look wrong and never break layout.
 *
 * `default` is the absence of a skin: it matches no rules and the base stylesheet stands as-is.
 * Every skin file is additive.
 */
export interface Skin {
  id: string
  label: string
  /** The values a user can move. Rendered as sliders in the palette editor, written to the root
   *  element as CSS vars. A skin with none renders no controls. */
  knobs: SkinKnob[]
}

/**
 * One numeric CSS var a skin exposes. Numeric on purpose: a slider is the whole UI, and a number is
 * the only thing worth storing per palette. Effects that need a string (a shadow, a gradient) are
 * built inside the skin's CSS out of numbers like these.
 */
export interface SkinKnob {
  /** The CSS var name, `--` included. Also the key it stores under in `palette.skinVars`. */
  name: string
  label: string
  min: number
  max: number
  step: number
  /** Appended to the number to make the CSS value: '%', 'px', or '' for unitless. */
  unit: string
  /** What the skin's stylesheet already declares. Shown when the palette has no value of its own. */
  fallback: number
}

// a plain array with static CSS imports. User-uploaded skins would make this a stored
// record with a CSS text field, reusing scopeCss/sanitizeHtml the way backgrounds already do.
export const skins: Skin[] = [
  { id: 'default', label: 'Default', knobs: [] },
  {
    id: 'glass',
    label: 'Glass',
    knobs: [
      { name: '--glassTint', label: 'Tint', min: 0, max: 100, step: 1, unit: '%', fallback: 46 },
      { name: '--glassBlur', label: 'Blur', min: 0, max: 40, step: 1, unit: 'px', fallback: 12 },
      { name: '--glassEdge', label: 'Edge', min: 0, max: 100, step: 1, unit: '%', fallback: 40 },
      { name: '--glassShade', label: 'Shadow', min: 0, max: 100, step: 1, unit: '%', fallback: 22 },
    ],
  },
]

export function findSkin(id: string): Skin | undefined {
  return skins.find((s) => s.id === id)
}

/** `--name` → value for the active skin's knobs, skipping any the palette has no number for. The
 *  skin's own stylesheet default shows through instead. */
export function skinVars(skinId: string, stored: Record<string, number>): Record<string, string> {
  const skin = findSkin(skinId)
  if (!skin) return {}
  const vars: Record<string, string> = {}
  for (const knob of skin.knobs) {
    const value = stored[knob.name]
    if (typeof value === 'number' && Number.isFinite(value)) {
      vars[knob.name] = `${clamp(value, knob.min, knob.max)}${knob.unit}`
    }
  }
  return vars
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}
