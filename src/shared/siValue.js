// Reads and writes component values for simulation: "1 kΩ", "47 nF", "10 µF", "4R7", "500 mA", "1/4 W" → numbers in base units.

const PREFIXES = { p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, μ: 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9 }
const UNITS = { Ω: /^(?:Ω|ω|ohms?|r)$/i, F: /^f(?:arads?)?$/i, H: /^h(?:enr(?:y|ies))?$/i, V: /^v(?:olts?)?$/i, A: /^a(?:mps?)?$/i, W: /^w(?:atts?)?$/i }
const NUMBER = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(.*)$/i

// The value of `text` in base units (ohms, farads, volts…), or null when it does not read as one. The unit letter is
// optional; a trailing "m" is milli and "M" or "meg" is mega, as in SPICE. A range such as "10–100 pF" reads as its first number.
export function parseQuantity(text, unit) {
  let clean = String(text ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[–—]/g, '-')
  const range = clean.match(/^(\d*\.?\d+)-(\d*\.?\d+)(.*)$/)
  if (range) clean = `${range[1]}${range[3]}`
  if (unit === 'Ω') {
    // 4R7 and 1k5 put the multiplier where the decimal point goes.
    const coded = clean.match(/^(\d+)([RkKM])(\d+)(?:Ω|ohms?)?$/)
    if (coded) return Number((Number(`${coded[1]}.${coded[3]}`) * (coded[2] === 'R' ? 1 : PREFIXES[coded[2]])).toPrecision(12))
  }
  const match = clean.match(NUMBER)
  if (!match) return null
  const number = Number(match[1])
  let rest = match[2]
  let factor = 1
  if (/^meg/i.test(rest)) {
    factor = 1e6
    rest = rest.slice(3)
  } else if (rest && PREFIXES[rest[0]] !== undefined && !(rest.length === 1 && UNITS[unit]?.test(rest))) {
    factor = PREFIXES[rest[0]]
    rest = rest.slice(1)
  }
  if (rest && !UNITS[unit]?.test(rest)) return null
  const value = Number((number * factor).toPrecision(12))
  return Number.isFinite(value) ? value : null
}

// Power ratings are written as 1/4, 0.5, "1/2 W" or "250 mW".
export function parseWattage(text) {
  const fraction = String(text ?? '')
    .trim()
    .match(/^(\d+)\s*\/\s*(\d+)\s*w?$/i)
  if (fraction) return Number(fraction[2]) ? Number(fraction[1]) / Number(fraction[2]) : null
  return parseQuantity(text, 'W')
}

const ENGINEERING = [
  [1e9, 'G'],
  [1e6, 'M'],
  [1e3, 'k'],
  [1, ''],
  [1e-3, 'm'],
  [1e-6, 'µ'],
  [1e-9, 'n'],
  [1e-12, 'p'],
]

// 0.00314 → "3.14 mA", 4.7e-8 → "47 nF". Values too small to matter print as 0.
export function formatQuantity(value, unit) {
  if (!Number.isFinite(value)) return '—'
  const magnitude = Math.abs(value)
  if (magnitude < 1e-15) return `0 ${unit}`
  const [scale, prefix] = ENGINEERING.find(([size]) => magnitude >= size * 0.9995) ?? ENGINEERING[ENGINEERING.length - 1]
  return `${Number((value / scale).toPrecision(3))} ${prefix}${unit}`
}
