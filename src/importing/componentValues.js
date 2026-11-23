import { findLibraryItem } from '../circuit/library.js'
// Reads component values as they are written on schematics ("47K", "1k5", ".02", "220 μμ", "0.01uF", "250kA") and
// returns them in the format the editor uses ("47 kΩ", "1.5 kΩ", "0.02 µF", "220 pF").

const KIND_BY_CATEGORY = { RESISTORS: 'resistance', CAPACITORS: 'capacitance' }
// Scanned "1" and "0" are often read as I, l and O; only applied to text that has a value's shape.
const CONFUSABLE = { O: '0', o: '0', I: '1', l: '1' }
const RESISTANCE_PREFIX = { k: 1e3, K: 1e3, M: 1e6, m: 1e6, R: 1, r: 1 }
const CAPACITANCE_UNIT = {
  pf: 'pF',
  mmf: 'pF',
  mmfd: 'pF',
  uuf: 'pF',
  uu: 'pF',
  μμf: 'pF',
  μμ: 'pF',
  nf: 'nF',
  uf: 'µF',
  μf: 'µF',
  ufd: 'µF',
  μfd: 'µF',
  mfd: 'µF',
  mf: 'µF',
}

// Resistors come in standard series; 2.5 and 5 are the usual potentiometer values (25K, 250K, 500K). A reading outside them
// is almost always a misread, so it is not used.
const STANDARD_MANTISSAS = new Set([1, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2, 2.2, 2.4, 2.5, 2.7, 3, 3.3, 3.6, 3.9, 4.3, 4.7, 5, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1])
const isStandardResistance = (ohms) => STANDARD_MANTISSAS.has(Number((ohms / 10 ** Math.floor(Math.log10(ohms))).toPrecision(3)))

const trimNumber = (number) => String(Number(number.toPrecision(4)))

export const valueKindOf = (type) => KIND_BY_CATEGORY[findLibraryItem(type)?.category] ?? null

const fixConfusables = (text) => (/^[0-9OoIl.]+[kKMR]?[0-9OoIl]*[ABC]?$/.test(text) && /[0-9kKMR]/.test(text) ? text.replace(/[OoIl]/g, (char) => CONFUSABLE[char]) : text)

function parseResistance(text) {
  const clean = fixConfusables(text.replace(/\s+/g, ''))
  // 1k5 and 4R7 put the unit where the decimal point goes.
  const coded = clean.match(/^(\d+)([kKMR])(\d+)$/)
  const plain = clean.match(/^(\d*\.?\d+)([kKMR]|Ω|ohms?)?(?:Ω|ohms?)?([ABC])?$/i)
  let ohms
  if (coded) ohms = Number(`${coded[1]}.${coded[3]}`) * RESISTANCE_PREFIX[coded[2]]
  else if (plain && (plain[2] || /Ω|ohm/i.test(clean))) {
    const prefix = RESISTANCE_PREFIX[plain[2]] ?? 1
    // A taper letter (250kA) is only meaningful after a multiplier.
    if (plain[3] && prefix === 1 && !/ohm|Ω/i.test(clean)) return null
    ohms = Number(plain[1]) * prefix
  }
  if (!ohms || ohms <= 0 || !isStandardResistance(ohms)) return null
  if (ohms >= 1e6) return `${trimNumber(ohms / 1e6)} MΩ`
  if (ohms >= 1e3) return `${trimNumber(ohms / 1e3)} kΩ`
  return `${trimNumber(ohms)} Ω`
}

function parseCapacitance(text) {
  const clean = text.replace(/\s+/g, '').replace(/µ/g, 'μ')
  const unit = clean.match(/^(\d*\.?\d+)([A-Za-zµμ]+)\.?$/)
  if (unit) {
    const name = CAPACITANCE_UNIT[unit[2].toLowerCase()]
    if (name && Number(unit[1]) > 0) return `${trimNumber(Number(unit[1]))} ${name}`
  }
  // Electrolytics are often drawn as "20/450": microfarads over working volts.
  const rated = clean.match(/^(\d+)\/(\d{2,3})$/)
  if (rated && Number(rated[1]) > 0 && Number(rated[2]) >= 6) return `${rated[1]} µF`
  // Vintage drawings write a bare decimal such as ".02" for microfarads.
  const bare = clean.match(/^0?\.(\d+)$/)
  return bare ? `${trimNumber(Number(`0.${bare[1]}`))} µF` : null
}

// The value written in `text` for a component of the given kind ('resistance' or 'capacitance'), or null.
export function parseValue(text, kind) {
  const word = text.replace(/^[^A-Za-z0-9.µμ]+|[^A-Za-z0-9µμΩ]+$/g, '')
  if (kind === 'resistance') return parseResistance(word)
  if (kind === 'capacitance') return parseCapacitance(word)
  return null
}

const gapBetween = (box, word) => {
  const dx = Math.max(0, box[0] - (word.x + word.width), word.x - box[2])
  const dy = Math.max(0, box[1] - (word.y + word.height), word.y - box[3])
  return Math.hypot(dx, dy)
}

// The value of the closest text beside a symbol box ([left, top, right, bottom] in image pixels), if it reads as a value of
// the component's kind. Text further than about a symbol's own size away belongs to another part.
export function valueNear(box, type, words) {
  const kind = valueKindOf(type)
  if (!kind || !words?.length) return ''
  const reach = Math.max(40, 1.2 * Math.max(box[2] - box[0], box[3] - box[1]))
  const candidates = words
    .map((word) => ({ gap: gapBetween(box, word), value: parseValue(word.text, kind) }))
    .filter((item) => item.value && item.gap <= reach)
    .sort((a, b) => a.gap - b.gap)
  return candidates[0]?.value ?? ''
}
