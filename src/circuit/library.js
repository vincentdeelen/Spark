import { tubeAliases } from '../tubes/tubeNames.js'
import { DEFAULT_RIBBON_PINS, RIBBON_TYPE, ribbonValue } from './ribbon.js'
import { TRANSFORMER_RATINGS } from './transformers.js'

// The catalogue of parts the toolbox offers, and questions about it.

export const library = [
  { type: 'inductor', name: 'Inductor', value: '10 µH', prefix: 'L', category: 'PASSIVE' },
  // Transformers: one family with a symbol and a set of characteristics per kind (see transformers.js).
  { type: 'transformer', name: 'Transformer', value: '1:1', prefix: 'T', category: 'TRANSFORMERS', ratings: TRANSFORMER_RATINGS.transformer },
  {
    type: 'power-transformer',
    name: 'Power transformer',
    value: '230 V / 2×350 V',
    prefix: 'PT',
    category: 'TRANSFORMERS',
    ratings: TRANSFORMER_RATINGS['power-transformer'],
    defaults: { primaryVoltage: '230', secondaryVoltage: '2×350 V, 6.3 V', frequency: '50' },
  },
  {
    type: 'output-transformer',
    name: 'Output transformer',
    value: '4.2 kΩ : 8 Ω',
    prefix: 'OT',
    category: 'TRANSFORMERS',
    ratings: TRANSFORMER_RATINGS['output-transformer'],
    defaults: { primaryImpedance: '4.2 kΩ', secondaryImpedance: '8 Ω' },
  },
  {
    type: 'single-ended-output-transformer',
    name: 'Single-ended output transformer',
    value: '5 kΩ : 8 Ω',
    prefix: 'OT',
    category: 'TRANSFORMERS',
    ratings: TRANSFORMER_RATINGS['single-ended-output-transformer'],
    defaults: { primaryImpedance: '5 kΩ', secondaryImpedance: '8 Ω' },
  },
  {
    type: 'interstage-transformer',
    name: 'Interstage transformer',
    value: '10 kΩ : 600 Ω',
    prefix: 'T',
    category: 'TRANSFORMERS',
    ratings: TRANSFORMER_RATINGS['interstage-transformer'],
    defaults: { primaryImpedance: '10 kΩ', secondaryImpedance: '600 Ω' },
  },
  { type: 'resistor', name: 'Resistor', value: '1 kΩ', prefix: 'R', category: 'RESISTORS' },
  { type: 'carbon-film-resistor', name: 'Carbon film resistor', value: '1 kΩ', prefix: 'R', category: 'RESISTORS' },
  { type: 'metal-film-resistor', name: 'Metal film resistor', value: '1 kΩ', prefix: 'R', category: 'RESISTORS' },
  { type: 'ceramic-resistor', name: 'Ceramic resistor', value: '1 kΩ', prefix: 'R', category: 'RESISTORS' },
  { type: 'wirewound-resistor', name: 'Wirewound resistor', value: '1 kΩ', prefix: 'R', category: 'RESISTORS' },
  { type: 'potentiometer', name: 'Potentiometer', value: '10 kΩ', prefix: 'R', category: 'RESISTORS' },
  { type: 'variable-resistor', name: 'Variable resistor', value: '10 kΩ', prefix: 'R', category: 'RESISTORS' },
  { type: 'thermistor', name: 'Thermistor', value: 'NTC', prefix: 'R', category: 'RESISTORS' },
  { type: 'photoresistor', name: 'Photoresistor', value: 'LDR', prefix: 'R', category: 'RESISTORS' },
  { type: 'capacitor', name: 'Capacitor', value: '100 nF', prefix: 'C', category: 'CAPACITORS' },
  { type: 'ceramic-capacitor', name: 'Ceramic capacitor', value: '100 nF', prefix: 'C', category: 'CAPACITORS' },
  { type: 'film-capacitor', name: 'Film capacitor', value: '100 nF', prefix: 'C', category: 'CAPACITORS' },
  { type: 'electrolytic-capacitor', name: 'Electrolytic capacitor', value: '10 µF', prefix: 'C', category: 'CAPACITORS' },
  { type: 'tantalum-capacitor', name: 'Tantalum capacitor', value: '1 µF', prefix: 'C', category: 'CAPACITORS' },
  { type: 'variable-capacitor', name: 'Variable capacitor', value: '10–100 pF', prefix: 'C', category: 'CAPACITORS' },
  { type: 'trimmer-capacitor', name: 'Trimmer capacitor', value: '5–30 pF', prefix: 'C', category: 'CAPACITORS' },
  { type: 'diode', name: 'Diode', value: '1N4148', prefix: 'D', category: 'DIODES' },
  { type: 'rectifier-diode', name: 'Rectifier diode', value: '1N4007', prefix: 'D', category: 'DIODES' },
  { type: 'zener-diode', name: 'Zener diode', value: 'Zener', prefix: 'D', category: 'DIODES' },
  { type: 'schottky-diode', name: 'Schottky diode', value: 'Schottky', prefix: 'D', category: 'DIODES' },
  { type: 'led', name: 'LED', value: 'LED', prefix: 'D', category: 'DIODES' },
  { type: 'photodiode', name: 'Photodiode', value: 'Photodiode', prefix: 'D', category: 'DIODES' },
  { type: 'varactor-diode', name: 'Varactor diode', value: 'Varactor', prefix: 'D', category: 'DIODES' },
  { type: 'transistor', name: 'Transistor', value: 'NPN', prefix: 'Q', category: 'SEMICONDUCTORS' },
  { type: 'tube', name: 'Tube', value: 'Triode', prefix: 'V', category: 'TUBES' },
  { type: 'el84', name: 'EL84 tube', value: 'EL84', prefix: 'V', category: 'TUBES' },
  { type: '12ax7', name: '12AX7 tube', value: '12AX7', prefix: 'V', category: 'TUBES' },
  { type: '12at7', name: '12AT7 tube', value: '12AT7', prefix: 'V', category: 'TUBES' },
  { type: '12au7', name: '12AU7 tube', value: '12AU7', prefix: 'V', category: 'TUBES' },
  { type: '6l6gc', name: '6L6GC tube', value: '6L6GC', prefix: 'V', category: 'TUBES' },
  // Drawings often show each triode of a dual triode as its own symbol, labelled with a section letter (V2A, V2B).
  { type: '12ax7-triode', name: '12AX7 split', value: '12AX7', prefix: 'V', category: 'TUBES', ratings: ['section'], defaults: { section: 'A' } },
  { type: '12at7-triode', name: '12AT7 split', value: '12AT7', prefix: 'V', category: 'TUBES', ratings: ['section'], defaults: { section: 'A' } },
  { type: '12au7-triode', name: '12AU7 split', value: '12AU7', prefix: 'V', category: 'TUBES', ratings: ['section'], defaults: { section: 'A' } },
  { type: 'ground', name: 'Ground', value: 'GND', prefix: 'GND', category: 'POWER' },
  { type: 'source', name: 'Voltage source', value: '5 V', prefix: 'V', category: 'POWER' },
  { type: 'switch', name: 'Switch', value: 'SW', prefix: 'SW', category: 'POWER' },
  { type: 'fuse', name: 'Fuse', value: '1 A', prefix: 'F', category: 'FUSES', ratings: ['voltage', 'size', 'speed'] },
  {
    type: 'glass-fuse',
    name: 'Glass cartridge fuse',
    value: '1 A',
    prefix: 'F',
    category: 'FUSES',
    ratings: ['voltage', 'size', 'speed'],
    defaults: { voltage: '250', size: '5×20 mm', speed: 'fast' },
  },
  {
    type: 'ceramic-fuse',
    name: 'Ceramic cartridge fuse',
    value: '1 A',
    prefix: 'F',
    category: 'FUSES',
    ratings: ['voltage', 'size', 'speed'],
    defaults: { voltage: '250', size: '5×20 mm', speed: 'fast' },
  },
  { type: 'blade-fuse', name: 'Blade fuse', value: '10 A', prefix: 'F', category: 'FUSES', ratings: ['voltage', 'size'], defaults: { voltage: '32', size: 'Standard blade' } },
  { type: 'resettable-fuse', name: 'Resettable fuse (PTC)', value: '500 mA', prefix: 'F', category: 'FUSES', ratings: ['voltage', 'size'], defaults: { voltage: '16' } },
  { type: 'thermal-fuse', name: 'Thermal fuse', value: '10 A', prefix: 'F', category: 'FUSES', ratings: ['voltage'], defaults: { voltage: '250' } },
  { type: 'relay', name: 'Relay', value: 'SPST-NO', prefix: 'K', category: 'POWER' },
  // Joins circuit boards; each conductor is a pin numbered J1, J2… (stored in `pins`).
  { type: RIBBON_TYPE, name: 'Ribbon cable', value: ribbonValue(DEFAULT_RIBBON_PINS.length), prefix: 'W', category: 'CONNECTORS' },
]

export const findLibraryItem = (type) => library.find((item) => item.type === type)

// Diodes are sometimes drawn at an angle, as in a bridge rectifier, so they turn in 45° steps; everything else in 90° steps.
export const rotationStep = (type) => (findLibraryItem(type)?.category === 'DIODES' ? 45 : 90)
export const isValidRotation = (type, rotation) => Number.isInteger(rotation) && rotation >= 0 && rotation < 360 && rotation % rotationStep(type) === 0

export function isResistor(type) {
  return library.some((item) => item.type === type && item.category === 'RESISTORS')
}

export const fuseTypes = library.filter((item) => item.category === 'FUSES').map((item) => item.type)

// Words the toolbox search matches for a library item besides its name: tubes are also valves, under their equivalent names.
export const equivalentNames = (item) => (item.category === 'TUBES' ? tubeAliases(item.type.replace(/-triode$/, '')) : [])
export const searchTextOf = (item) => [item.name, item.category, ...(item.category === 'TUBES' ? ['valve'] : []), ...equivalentNames(item)].join(' ')

// Toolbox items grouped by the base component they are subtypes of (e.g. all tubes under "Tube").
const familyIdByCategory = { RESISTORS: 'resistor', CAPACITORS: 'capacitor', DIODES: 'diode', FUSES: 'fuse', TUBES: 'tube', TRANSFORMERS: 'transformer' }
export const componentFamilies = library.reduce((groups, item) => {
  const id = familyIdByCategory[item.category] || item.type
  let family = groups.find((group) => group.id === id)
  if (!family) {
    family = { id, name: findLibraryItem(id).name, subtypes: [] }
    groups.push(family)
  }
  family.subtypes.push(item)
  return groups
}, [])
