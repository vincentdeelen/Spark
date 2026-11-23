import { changeSubtype } from './diagramOps.js'
import { TRANSFORMER_RATINGS } from './transformers.js'

// Known transformers and their details, so a part can be placed (or an existing transformer switched to it) with its
// characteristics filled in. An entry says what kind of transformer it is and which characteristics are published; a
// characteristic that is not published is left empty rather than guessed. `notes` and `source` are shown with the part.
//   id, make, partNumber, aliases   how the part is named; `aliases` are other part numbers for the same part
//   type                            the transformer kind in the library
//   title                           what it is
//   characteristics                 values for the fields of that kind (see RATING_FIELDS in ratings.js)
//   notes                           further facts worth knowing, one per line
//   source                          where the figures come from

export const TRANSFORMER_CATALOG = [
  {
    id: 'peavey-70500211',
    make: 'Peavey',
    partNumber: '70500211',
    aliases: ['705-00211', '30500211'],
    type: 'output-transformer',
    title: 'Output transformer of the Classic 50 (four EL84)',
    characteristics: { secondaryImpedance: '8 Ω / 16 Ω', wattage: '50' },
    notes: [
      'Push-pull output transformer for the four EL84 output tubes of the Peavey Classic 50 and the Classic 5050 power amp.',
      'Secondary taps: black 0, white 8 Ω, orange 16 Ω.',
      'The primary impedance and the winding resistances are not published; enter them from your unit if you measure it.',
    ],
    source: 'https://www.tubeampdoctor.com/en/original-peavey-output-transformer-for-classic-50-power-amp-classic-5050',
  },
  {
    id: 'peavey-29231',
    make: 'Peavey',
    partNumber: '29231',
    aliases: ['P-CL50-P', 'P-CL50-P-240'],
    type: 'power-transformer',
    title: 'Power transformer of the Classic 50',
    characteristics: {
      primaryVoltage: '220 / 230 / 240',
      secondaryVoltage: '315 V, 21.5-0-21.5 V, 6.3 V',
    },
    notes: [
      'Power transformer of the Peavey Classic 50. The figures are from the Mercury Magnetics replacement P-CL50-P-240 (220, 230 and 240 V primary); its 120 V twin is the P-CL50-P.',
      'Secondaries: 315 V high-voltage winding (red, red), 21.5-0-21.5 V bias winding (orange, orange/white, white/red) and 6.3 V filament winding (yellow, black/yellow). The currents are not published.',
      'These are the Mercury replacement figures; only its 120 V data sheet could be found, the secondaries of the 240 V version are assumed to be identical. Peavey publishes nothing about the original 29231.',
      'Winding resistances and frequency are not published and are not filled in.',
    ],
    source: 'https://www.mercurymagnetics.com/wp-content/uploads/shop/specsheets/P-CL50-P.pdf',
  },
  {
    id: 'hammond-125ese',
    make: 'Hammond',
    partNumber: '125ESE',
    aliases: [],
    type: 'single-ended-output-transformer',
    title: 'Universal single-ended tube output transformer, 15 W',
    characteristics: { primaryImpedance: '2.5 kΩ – 10 kΩ', secondaryImpedance: '4 Ω – 32 Ω', wattage: '15', primaryDcr: '90.6', secondaryDcr: '0.297' },
    notes: [
      'Primary impedance 2.5 kΩ, 5 kΩ or 10 kΩ and secondary 4, 8, 16 or 32 Ω, chosen by the taps. For example 8 Ω at 2.5 kΩ, 16 Ω at 5 kΩ and 32 Ω at 10 kΩ (see the data sheet for the other combinations).',
      'Primary inductance at least 9.58 H; primary DC resistance 90.6 Ω ±20%.',
      'Secondary DC resistance 0.167 Ω (black–orange), 0.225 Ω (black–green) and 0.297 Ω (black–yellow); the entry uses the largest.',
      'Maximum DC bias 80 mA: the core has an air gap for single-ended use.',
      'Frequency response 100 Hz to 15 kHz at full power (±1 dB).',
    ],
    source: 'https://www.hammfg.com/part/125ESE',
  },
  {
    id: 'hammond-291aex',
    make: 'Hammond',
    partNumber: '291AEX',
    aliases: [],
    type: 'power-transformer',
    title: 'Power transformer for Fender Champ amplifiers (290 series)',
    characteristics: {
      primaryVoltage: '120 / 220 / 230 / 240',
      frequency: '50/60',
      secondaryVoltage: '325-0-325 V @ 100 mA, 5 V @ 3 A, 6.3 V CT @ 2.25 A',
      primaryDcr: '19.6',
      secondaryDcr: '334',
    },
    notes: [
      'Replacement for the Fender Champ: 5C1, 5E1, 5F1, tweed, blackface, silverface and AA764.',
      'High-voltage winding 650 V centre-tapped (Hammond also lists 550 V) at 100 mA, a 5 V rectifier winding at 3 A and a 6.3 V centre-tapped heater winding at 2.25 A (2 A in its short description).',
      'DC resistance at 20 °C, ±20%: 19.6 Ω primary, 334 Ω high-voltage winding, 0.107 Ω and 0.088 Ω for the low-voltage windings.',
      'Exciting current 230 mA at most (240 V, 50 Hz); turns ratio 1 : 5.82 on the high-voltage winding.',
      'The power rating is not published; it is not filled in.',
    ],
    source: 'https://www.hammfg.com/part/291AEX',
  },
]

export const CATALOG_PREFIX = 'catalog:'
// The toolbox treats a catalog entry as a thing to place, named like a tool: 'catalog:hammond-291aex'.
export const catalogTool = (entry) => `${CATALOG_PREFIX}${entry.id}`
export const catalogEntryOfTool = (tool) => (tool?.startsWith?.(CATALOG_PREFIX) ? TRANSFORMER_CATALOG.find((entry) => catalogTool(entry) === tool) : undefined)
export const catalogName = (entry) => `${entry.make} ${entry.partNumber}`

const simplify = (text) =>
  String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

// The catalog entry a text names: "Hammond 291AEX", "291aex", "705-00211"… The make is optional, spacing and dashes do not matter.
export function findCatalogEntry(text) {
  const wanted = simplify(text)
  if (!wanted) return undefined
  return TRANSFORMER_CATALOG.find((entry) =>
    [catalogName(entry), entry.partNumber, ...entry.aliases, ...entry.aliases.map((alias) => `${entry.make} ${alias}`)].some((name) => simplify(name) === wanted),
  )
}

// What the toolbox search matches for an entry.
export const catalogSearchText = (entry) => [entry.make, entry.partNumber, ...entry.aliases, entry.title, 'transformer catalog'].join(' ')

const TRANSFORMER_FIELDS = new Set(Object.values(TRANSFORMER_RATINGS).flat())

// The component as that catalog part: its kind and value become the part's, the characteristics are replaced by the part's
// (none are kept from before, so nothing of the previous part is left over), and its label, position and size are kept.
export function applyCatalogEntry(component, entry) {
  const switched = changeSubtype(component, entry.type)
  const kept = Object.fromEntries(Object.entries(switched).filter(([key]) => !TRANSFORMER_FIELDS.has(key)))
  return { ...kept, ...entry.characteristics, type: entry.type, value: catalogName(entry) }
}
