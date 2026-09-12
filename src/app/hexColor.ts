// Hex text handling for ColorInput's manual field. Kept out of the component so a check script can
// import it. The field is a parser, and a parser that quietly accepts junk writes junk into a
// palette, which then reaches `style.setProperty`.

/**
 * What the field shows while typing: one leading `#`, hex digits only, uppercase, cut at the
 * longest form the field accepts. Everything else the user types is dropped as it is typed. A
 * half-finished value stays in the field instead of being rejected on the way in.
 */
export function sanitizeHexText(raw: string, allowAlpha = false): string {
  const digits = raw
    .replace('#', '')
    .replace(/[^0-9a-fA-F]/g, '')
    .toUpperCase()
    .slice(0, allowAlpha ? 8 : 6)
  return digits ? `#${digits}` : ''
}

const expand = (digits: string) => digits.split('').map((c) => c + c).join('')

/**
 * The stored form of a typed color: `#RRGGBB`, or `#RRGGBBAA` where alpha is allowed. `''` is the
 * empty field, which every caller looks like unset. `null` means the text is not a complete color
 * yet: the caller leaves the value alone and lets the typing continue.
 *
 * Shorthand expands (`#ABC` → `#AABBCC`). Eight digits pasted into a field without alpha lose the
 * alpha pair: the field has nowhere to keep it.
 */
export function normalizeHex(raw: string, allowAlpha = false): string | null {
  const digits = sanitizeHexText(raw, allowAlpha).slice(1)
  if (!digits) return ''
  if (digits.length === 3) return `#${expand(digits)}`
  if (digits.length === 4 && allowAlpha) return `#${expand(digits)}`
  if (digits.length === 6) return `#${digits}`
  if (digits.length === 8 && allowAlpha) return `#${digits}`
  return null
}
