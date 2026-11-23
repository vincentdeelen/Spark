import { formatQuantity, parseQuantity, parseWattage } from '../shared/siValue.js'

// Transformers: the kinds the library offers, where their windings connect, what is typical of each, and the numbers that
// follow from the characteristics entered on a component. Pure data and arithmetic; the symbols are drawn in
// components/symbols/TransformerSymbol.jsx and the terminals below are in the same coordinates (centre 0,0).

export const TRANSFORMER_TYPES = ['transformer', 'power-transformer', 'output-transformer', 'single-ended-output-transformer', 'interstage-transformer']
export const isTransformer = (type) => TRANSFORMER_TYPES.includes(type)

// Terminals in symbol coordinates. Primary on the left, secondaries on the right. `p1`/`p2` are the ends of the primary and
// `pc` its centre tap; `s1`/`s2` a secondary (`sc` its centre tap); a power transformer's high-voltage winding is `v1`, `vc` (centre tap), `v2` and
// its heater winding `f1`, `f2`.
const GENERIC_PINS = [
  { pin: 'p1', x: -40, y: -20 },
  { pin: 'p2', x: -40, y: 20 },
  { pin: 's1', x: 40, y: -20 },
  { pin: 's2', x: 40, y: 20 },
]
export const TRANSFORMER_TERMINALS = {
  transformer: GENERIC_PINS,
  'interstage-transformer': [
    { pin: 'p1', x: -40, y: -20 },
    { pin: 'p2', x: -40, y: 20 },
    { pin: 's1', x: 40, y: -20 },
    { pin: 'sc', x: 40, y: 0 },
    { pin: 's2', x: 40, y: 20 },
  ],
  // Single ended: the whole primary carries one tube's plate current, so there is no centre tap.
  'single-ended-output-transformer': [
    { pin: 'p1', x: -40, y: -20 },
    { pin: 'p2', x: -40, y: 20 },
    { pin: 's1', x: 40, y: -12 },
    { pin: 's2', x: 40, y: 12 },
  ],
  'output-transformer': [
    { pin: 'p1', x: -40, y: -20 },
    { pin: 'pc', x: -40, y: 0 },
    { pin: 'p2', x: -40, y: 20 },
    { pin: 's1', x: 40, y: -12 },
    { pin: 's2', x: 40, y: 12 },
  ],
  'power-transformer': [
    { pin: 'p1', x: -40, y: -20 },
    { pin: 'p2', x: -40, y: 20 },
    { pin: 'v1', x: 40, y: -28 },
    { pin: 'vc', x: 40, y: -16 },
    { pin: 'v2', x: 40, y: -4 },
    { pin: 'f1', x: 40, y: 8 },
    { pin: 'f2', x: 40, y: 24 },
  ],
}

export const TRANSFORMER_PIN_NAMES = {
  p1: 'primary start',
  p2: 'primary end',
  pc: 'primary centre tap',
  s1: 'secondary start',
  s2: 'secondary end',
  sc: 'secondary centre tap',
  v1: 'high-voltage winding start',
  vc: 'high-voltage centre tap',
  v2: 'high-voltage winding end',
  f1: 'heater winding start',
  f2: 'heater winding end',
}

// Which characteristic each kind carries (see RATING_FIELDS in ratings.js).
export const TRANSFORMER_RATINGS = {
  transformer: ['wattage', 'primaryDcr', 'secondaryDcr'],
  'power-transformer': ['primaryVoltage', 'secondaryVoltage', 'frequency', 'wattage', 'primaryDcr', 'secondaryDcr'],
  'output-transformer': ['primaryImpedance', 'secondaryImpedance', 'wattage', 'primaryDcr', 'secondaryDcr'],
  'single-ended-output-transformer': ['primaryImpedance', 'secondaryImpedance', 'wattage', 'primaryDcr', 'secondaryDcr'],
  'interstage-transformer': ['primaryImpedance', 'secondaryImpedance', 'primaryDcr', 'secondaryDcr'],
}

const INFO = {
  transformer: {
    title: 'Transformer',
    summary: 'Two windings on one core. Choose Power, Output or Interstage transformer for the usual amplifier transformers.',
    windings: [
      ['Primary', 'Left side, top and bottom terminals'],
      ['Secondary', 'Right side, top and bottom terminals'],
    ],
    typical: [],
  },
  'power-transformer': {
    title: 'Power transformer (PT)',
    summary: 'Steps the mains voltage up to the high voltage the tube plates need and down to the heater voltage.',
    windings: [
      ['Primary (mains)', 'Left side'],
      ['High-voltage secondary', 'Right side, upper winding, with a centre tap for the rectifier'],
      ['Heater winding', 'Right side, lower winding'],
    ],
    typical: [
      ['Primary', '115 V or 230 V, 50 or 60 Hz'],
      ['High-voltage secondary', '2×250 V to 2×400 V, centre tapped'],
      ['Heater winding', '6.3 V, 2 A to 6 A'],
      ['Power rating', '50 VA to 250 VA in a guitar amplifier'],
      ['Primary DC resistance', 'a few ohms'],
      ['High-voltage DC resistance', '50 Ω to 200 Ω'],
    ],
  },
  'output-transformer': {
    title: 'Output transformer (OT)',
    summary: 'Matches the high impedance the output tubes want to see to the low impedance of the speaker.',
    windings: [
      ['Primary', 'Left side: the outer terminals go to the output tube plates, the centre tap to the high-voltage supply (B+)'],
      ['Secondary', 'Right side: the speaker'],
    ],
    typical: [
      ['Primary impedance', '2 kΩ to 8 kΩ plate to plate (push-pull)'],
      ['Secondary impedance', '4 Ω, 8 Ω or 16 Ω'],
      ['Power rating', '15 W to 100 W'],
      ['Primary DC resistance', '50 Ω to 200 Ω in all'],
      ['Secondary DC resistance', 'under 1 Ω'],
      ['Frequency response', 'about 40 Hz to 20 kHz'],
    ],
  },
  'single-ended-output-transformer': {
    title: 'Single-ended output transformer (OT)',
    summary: 'Matches a single output tube (class A) to the speaker. The primary carries the whole plate current, so the core has an air gap to keep it from saturating.',
    windings: [
      ['Primary', 'Left side: B+ to one end, the output tube plate to the other'],
      ['Secondary', 'Right side: the speaker'],
    ],
    typical: [
      ['Primary impedance', '2.5 kΩ to 10 kΩ'],
      ['Secondary impedance', '4 Ω, 8 Ω or 16 Ω'],
      ['Power rating', '3 W to 25 W'],
      ['Primary DC resistance', '50 Ω to 250 Ω'],
      ['Maximum DC bias', 'a few tens of milliamps (limited by the air gap)'],
    ],
  },
  'interstage-transformer': {
    title: 'Interstage transformer',
    summary: 'Couples the driver stage to a push-pull pair of output tubes, splitting the signal into two opposite halves.',
    windings: [
      ['Primary', 'Left side: from the driver stage'],
      ['Secondary', 'Right side, centre tapped: the outer terminals go to the two output tube grids, the centre tap to the bias supply'],
    ],
    typical: [
      ['Primary impedance', '10 kΩ to 50 kΩ'],
      ['Secondary impedance', '600 Ω to 100 kΩ'],
      ['Primary DC resistance', '200 Ω to 1 kΩ'],
      ['Secondary DC resistance', '50 Ω to 500 Ω'],
    ],
  },
}

// Winding resistances assumed for the simulation when none is entered, per kind: total ohms of each winding.
const DEFAULT_DCR = {
  transformer: { primary: 1, secondary: 1 },
  'power-transformer': { primary: 5, secondary: 100, heater: 0.1 },
  'output-transformer': { primary: 150, secondary: 0.4 },
  'single-ended-output-transformer': { primary: 100, secondary: 0.3 },
  'interstage-transformer': { primary: 400, secondary: 100 },
}

// The windings of a component as resistances between two of its pins, which is all a winding is at DC:
// [{ name, a, b, ohms, assumed }]. A winding with a centre tap is two halves. `assumed` marks a resistance that was not entered.
export function transformerWindings(component) {
  const defaults = DEFAULT_DCR[component.type]
  if (!defaults) return []
  const read = (field, fallback) => {
    const entered = parseQuantity(component[field], 'Ω')
    return entered > 0 ? { ohms: entered, assumed: false } : { ohms: fallback, assumed: true }
  }
  const primary = read('primaryDcr', defaults.primary)
  const secondary = read('secondaryDcr', defaults.secondary)
  const winding = (name, a, b, { ohms, assumed }, share = 1) => ({ name, a, b, ohms: ohms * share, assumed })
  switch (component.type) {
    case 'output-transformer':
      return [winding('Primary (first half)', 'p1', 'pc', primary, 0.5), winding('Primary (second half)', 'pc', 'p2', primary, 0.5), winding('Secondary', 's1', 's2', secondary)]
    case 'interstage-transformer':
      return [
        winding('Primary', 'p1', 'p2', primary),
        winding('Secondary (first half)', 's1', 'sc', secondary, 0.5),
        winding('Secondary (second half)', 'sc', 's2', secondary, 0.5),
      ]
    case 'power-transformer':
      return [
        winding('Primary', 'p1', 'p2', primary),
        winding('High-voltage secondary (first half)', 'v1', 'vc', secondary, 0.5),
        winding('High-voltage secondary (second half)', 'vc', 'v2', secondary, 0.5),
        winding('Heater winding', 'f1', 'f2', { ohms: defaults.heater, assumed: true }),
      ]
    default:
      return [winding('Primary', 'p1', 'p2', primary), winding('Secondary', 's1', 's2', secondary)]
  }
}

// The numbers that follow from what is entered on the component: [[name, text]]. Only what can be worked out is listed.
function derivedRows(component) {
  const rows = []
  const primaryZ = parseQuantity(component.primaryImpedance, 'Ω')
  const secondaryZ = parseQuantity(component.secondaryImpedance, 'Ω')
  const power = parseWattage(component.wattage)
  if (primaryZ > 0 && secondaryZ > 0) {
    const ratio = Math.sqrt(primaryZ / secondaryZ)
    rows.push(['Turns ratio (primary : secondary)', `${Number(ratio.toPrecision(3))} : 1`])
    if (power > 0) {
      rows.push(['Secondary at full power', `${formatQuantity(Math.sqrt(power * secondaryZ), 'V')}, ${formatQuantity(Math.sqrt(power / secondaryZ), 'A')}`])
      rows.push(['Primary at full power', `${formatQuantity(Math.sqrt(power * primaryZ), 'V')} across the whole primary, ${formatQuantity(Math.sqrt(power / primaryZ), 'A')}`])
    }
  }
  const mains = parseQuantity(component.primaryVoltage, 'V')
  if (component.type === 'power-transformer' && mains > 0 && power > 0)
    rows.push(['Primary current at full load', `${formatQuantity(power / mains, 'A')} (choose the mains fuse above this)`])
  return rows
}

// What the Properties panel lists for a transformer, or null for any other component:
// { title, summary, windings: [[name, where]], typical: [[name, text]], derived: [[name, text]] }.
export function transformerSpecs(component) {
  const info = INFO[component.type]
  if (!info) return null
  return { ...info, derived: derivedRows(component) }
}
