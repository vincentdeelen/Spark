// "Tube" (US) and "valve" (UK) are the same component, and most tube types go by several names: the American RETMA number,
// the European Mullard-Philips code, the military/industrial number and the British CV number. Only the names of the
// tube types in the toolbox are listed. Variants such as the "A" and "WA" grades are interchangeable in a guitar-amp schematic.
export const TUBE_ALIASES = {
  el84: ['6BQ5', '7189', '7189A', 'N709', '6P14P'],
  '12ax7': ['ECC83', 'E83CC', '7025', '6681', 'B759', 'CV4004', '12AX7A', '12AX7WA'],
  '12at7': ['ECC81', 'E81CC', '6201', 'B309', 'CV4024', '12AT7WA'],
  '12au7': ['ECC82', 'E82CC', '5814', '5814A', '6189', 'B329', 'CV4003', '12AU7A', '12AU7WA'],
  '6l6gc': ['5881', '6L6WGC', '6L6WGB', '6L6GB', '6L6G', '6L6', '6P3S'],
}

const CANONICAL = { el84: 'EL84', '12ax7': '12AX7', '12at7': '12AT7', '12au7': '12AU7', '6l6gc': '6L6GC' }

export const tubeNames = (type) => (CANONICAL[type] ? [CANONICAL[type], ...TUBE_ALIASES[type]] : [])

export const tubeAliases = (type) => TUBE_ALIASES[type] ?? []

// A name written with optional hyphens or spaces ("EL-84", "12 AX 7"), alone or followed by a short grade suffix ("ECC83S", "6L6GCSTR").
// Purely numeric names take no suffix, so a capacitor "0.6201uF" is not a 6201.
const pattern = (name) => new RegExp(`(?<![A-Z0-9.])${[...name].join('[-\\s]?')}${/^\d+$/.test(name) ? '' : '[A-Z]{0,3}'}(?![A-Z0-9])`)

const matchers = Object.keys(CANONICAL).flatMap((type) => tubeNames(type).map((name) => ({ type, name, pattern: pattern(name) })))

// The toolbox tube type whose name (or equivalent name) appears in the text, preferring the longest name; '' when there is none.
export function tubeTypeFromText(text) {
  const upper = String(text ?? '').toUpperCase()
  const found = matchers.filter((matcher) => matcher.pattern.test(upper)).sort((a, b) => b.name.length - a.name.length)
  return found[0]?.type ?? ''
}

export const mentionsTube = (text) => /\b(tube|valve)s?\b/i.test(String(text ?? ''))
