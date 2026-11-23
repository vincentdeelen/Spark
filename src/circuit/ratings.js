import { findLibraryItem } from './library.js'

// Characteristics a component can carry besides its value (power, tolerance, fuse speed…), and how values are shown.

const withUnit = (unit) => (text) => (new RegExp(`${unit}$`, 'i').test(text) ? text : `${text} ${unit}`)

// IEC 60127 time-current codes; the letter is drawn on the symbol.
export const FUSE_SPEEDS = [
  { value: 'very-fast', label: 'Very fast blow (FF)', short: 'very fast blow', code: 'FF' },
  { value: 'fast', label: 'Fast blow (F)', short: 'fast blow', code: 'F' },
  { value: 'medium', label: 'Medium blow (M)', short: 'medium blow', code: 'M' },
  { value: 'slow', label: 'Slow blow (T)', short: 'slow blow', code: 'T' },
  { value: 'very-slow', label: 'Very slow blow (TT)', short: 'very slow blow', code: 'TT' },
]

// Accepts a stored value, an IEC code (F, T…) or wording such as "Slow blow" or "time-delay"; returns '' when unrecognised.
export function normalizeFuseSpeed(text) {
  const strip = (value) =>
    String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z]/g, '')
  const key = strip(text)
  if (!key) return ''
  const aliases = { timedelay: 'slow', timelag: 'slow', quick: 'fast', quickacting: 'fast', fastacting: 'fast' }
  if (aliases[key]) return aliases[key]
  return FUSE_SPEEDS.find((item) => [item.value, item.code, item.label, item.short].some((candidate) => strip(candidate) === key))?.value || ''
}

// Characteristics a component can carry besides its value. Which ones apply is decided per library item (`ratings`).
export const RATING_FIELDS = {
  wattage: { label: 'Power rating (W)', placeholder: 'e.g. 0.25', format: withUnit('W') },
  tolerance: {
    label: 'Tolerance (%)',
    placeholder: 'e.g. 5',
    format: (text) => `${/^(±|\+\/-)/.test(text) ? '' : '±'}${text}${text.endsWith('%') ? '' : '%'}`,
  },
  voltage: {
    label: 'Voltage rating (V)',
    placeholder: 'e.g. 250',
    format: withUnit('V'),
    bom: { title: 'Voltage', aliases: ['voltage', 'voltage rating', 'voltage rating (v)', 'rated voltage'] },
  },
  size: {
    label: 'Dimensions',
    placeholder: 'e.g. 5×20 mm',
    suggestions: ['5×20 mm', '6.3×32 mm', '4.5×15 mm', '3×10 mm', 'Mini blade', 'Standard blade', 'Maxi blade'],
    format: (text) => text,
    bom: { title: 'Size', aliases: ['size', 'dimensions', 'dimension', 'package'] },
  },
  speed: {
    label: 'Blow characteristic',
    options: FUSE_SPEEDS,
    format: (value) => FUSE_SPEEDS.find((item) => item.value === value)?.short ?? value,
    bom: { title: 'Speed', aliases: ['speed', 'blow', 'blow type', 'blow characteristic', 'characteristic', 'fast/slow'] },
  },
  // Transformer characteristics (see transformers.js for which kind carries which).
  primaryVoltage: {
    label: 'Primary voltage (V)',
    placeholder: 'e.g. 230',
    suggestions: ['115', '120', '230', '240'],
    format: withUnit('V'),
    bom: { title: 'Primary voltage', aliases: ['primary voltage', 'mains voltage', 'primary (v)'] },
  },
  secondaryVoltage: {
    label: 'Secondary voltages',
    placeholder: 'e.g. 2×350 V, 6.3 V',
    format: (text) => text,
    bom: { title: 'Secondary voltage', aliases: ['secondary voltage', 'secondary voltages', 'secondary', 'secondaries'] },
  },
  frequency: {
    label: 'Frequency (Hz)',
    placeholder: 'e.g. 50',
    suggestions: ['50', '60', '50/60'],
    format: withUnit('Hz'),
    bom: { title: 'Frequency', aliases: ['frequency', 'frequency (hz)'] },
  },
  primaryImpedance: {
    label: 'Primary impedance (Ω)',
    placeholder: 'e.g. 4.2 kΩ',
    suggestions: ['2.5 kΩ', '4.2 kΩ', '6.6 kΩ', '8 kΩ'],
    format: withUnit('Ω'),
    bom: { title: 'Primary impedance', aliases: ['primary impedance', 'primary impedance (ω)', 'primary z'] },
  },
  secondaryImpedance: {
    label: 'Secondary impedance (Ω)',
    placeholder: 'e.g. 8 Ω',
    suggestions: ['4 Ω', '8 Ω', '16 Ω'],
    format: withUnit('Ω'),
    bom: { title: 'Secondary impedance', aliases: ['secondary impedance', 'secondary impedance (ω)', 'secondary z', 'speaker impedance'] },
  },
  primaryDcr: {
    label: 'Primary DC resistance (Ω)',
    placeholder: 'e.g. 150',
    format: withUnit('Ω'),
    bom: { title: 'Primary DCR', aliases: ['primary dcr', 'primary dc resistance', 'primary resistance'] },
  },
  secondaryDcr: {
    label: 'Secondary DC resistance (Ω)',
    placeholder: 'e.g. 0.4',
    format: withUnit('Ω'),
    bom: { title: 'Secondary DCR', aliases: ['secondary dcr', 'secondary dc resistance', 'secondary resistance'] },
  },
  // The label already says which triode this is, so the section is not repeated under the component.
  section: {
    label: 'Triode half',
    required: true,
    options: [
      { value: 'A', label: 'Section A (pins 1, 2, 3)' },
      { value: 'B', label: 'Section B (pins 6, 7, 8)' },
    ],
    format: () => '',
  },
}
export const RATING_FIELD_NAMES = Object.keys(RATING_FIELDS)
// Ratings a BOM can specify; the triode section only says which half of a tube a symbol is.
export const BOM_RATING_FIELDS = RATING_FIELD_NAMES.filter((field) => field !== 'section')
// The ratings that get a BOM column of their own, and only when some component uses them, so a BOM without fuses or
// transformers keeps its familiar columns (wattage and tolerance have fixed columns).
export const BOM_OPTIONAL_RATINGS = RATING_FIELD_NAMES.filter((field) => RATING_FIELDS[field].bom)

export function ratingFields(type) {
  const item = findLibraryItem(type)
  if (!item) return []
  if (item.ratings) return item.ratings
  // Resistors carry a power rating, a tolerance and sometimes a voltage rating; capacitors a voltage rating and a tolerance.
  if (item.category === 'RESISTORS') return ['wattage', 'tolerance', 'voltage']
  if (item.category === 'CAPACITORS') return ['voltage', 'tolerance']
  return []
}

export function formatComponentValue(component) {
  const fields = ratingFields(component.type)
  if (!fields.length) return component.value
  return [component.value, ...fields.map((field) => component[field]?.trim() && RATING_FIELDS[field].format(component[field].trim()))].filter(Boolean).join(' · ')
}
