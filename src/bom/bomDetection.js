import { inferComponentType, labelCandidates } from './bom.js'
import { dualTriodeOf, isTriodeSection, splitSectionLabel, triodeSectionType } from '../tubes/triodes.js'
import { library } from '../circuit/library.js'
import { emptyModel, isLearnedMisread, predictOffset } from '../importing/referenceLearning.js'
import { normalizeLabel } from '../circuit/references.js'
import { mentionsTube, tubeTypeFromText } from '../tubes/tubeNames.js'

const MIN_APPROXIMATE_CONFIDENCE = 50
const MIN_APPROXIMATE_LENGTH = 3
const MIN_TABLE_ROWS = 6
const TUBE_TYPES = library.filter((item) => item.category === 'TUBES' && item.type !== 'tube' && !isTriodeSection(item.type)).map((item) => item.type)

// Jumpers and test points are drawn as J1, J58, JP3 … and are mostly not in the BOM. Such a label that is not a BOM reference
// is a jumper, never a misread of another part such as R58.
export const isJumperLabel = (label) => /^J(P|MP)?\d+[A-Z]?$/.test(normalizeLabel(label))

const stripPunctuation = (text) => text.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '')

const FUSE_KEYWORDS = [
  ['resettable-fuse', /resettable|\bptc\b|polyswitch|polyfuse/],
  ['thermal-fuse', /thermal|cut-?off/],
  ['blade-fuse', /blade|\bato\b|\batc\b/],
  ['ceramic-fuse', /ceramic/],
  ['glass-fuse', /glass|\bagc\b|\b[23]ag\b/],
]

// Wording in a BOM row's value or description that names the subtype of a part found by its prefix, as parts lists abbreviate
// it ("22 MFD 450 VDC LYTIC CAP", "100-5W-10% -WW-AXL", "1N757A 9.1V ZENER").
const SUBTYPE_KEYWORDS = {
  fuse: FUSE_KEYWORDS,
  capacitor: [
    ['electrolytic-capacitor', /lytic|\blyt\b|\bly\.? ?cap|\bel-ax|\brad\.? ?pc\b/],
    ['tantalum-capacitor', /tantal/],
    ['ceramic-capacitor', /ceramic|cer\b|\bcd-|\bdisc\b|\bmon\b|\bt\/c\b/],
    ['film-capacitor', /mylar|polyester|polypropylene|\bfilm\b/],
  ],
  resistor: [['wirewound-resistor', /\bww\b|wire ?wound/]],
  diode: [
    ['zener-diode', /zener/],
    ['led', /\bled\b/],
    ['schottky-diode', /schottky/],
    ['rectifier-diode', /rectifier|\b1n400\d|\b1n540\d/],
  ],
}

// The base type (capacitor, resistor…) when `type` is one of the subtypes a BOM's wording can name, else ''.
const familyOfSubtype = (type) => Object.keys(SUBTYPE_KEYWORDS).find((base) => SUBTYPE_KEYWORDS[base].some(([subtype]) => subtype === type)) ?? ''

// The component type for a BOM item: its own type, else what was learned for its prefix, else a built-in
// prefix guess (refined by the subtype its wording names), else a tube (or valve) named in its value or description, under any of its names.
export function inferBomType(item, model = emptyModel) {
  // A BOM that lists the triodes separately (V2A, V2B) describes sections of the dual triode.
  const dual = splitSectionLabel(item.label) && dualTriodeOf(item)
  if (dual) return triodeSectionType(dual)
  if (item.type) return item.type
  const prefix = normalizeLabel(item.label).match(/^[A-Z]+(?=\d)/)?.[0]
  // A subtype the wording names (electrolytic, wirewound…) belongs to one part, so learning it for a reference teaches the prefix
  // only its family; a learned prefix meaning such as VR for a potentiometer is kept.
  const learned = prefix && model.prefixTypes[prefix]
  const learnedFamily = learned && familyOfSubtype(learned)
  const byPrefix = (learned && !learnedFamily ? learned : '') || inferComponentType(item.label) || learnedFamily || ''
  const keywords = SUBTYPE_KEYWORDS[byPrefix]
  if (keywords) {
    const text = `${item.value} ${item.description}`.toLowerCase()
    return keywords.find(([, pattern]) => pattern.test(text))?.[0] || byPrefix
  }
  if (byPrefix) return byPrefix
  if (!/^V\d/.test(item.label)) return ''
  const text = `${item.value} ${item.description}`
  const named = tubeTypeFromText(text)
  return TUBE_TYPES.includes(named) ? named : mentionsTube(text) ? 'tube' : ''
}

// Matches OCR text to a BOM reference. Exact matches always win, then misreads the user has corrected before.
// Any other near match is accepted only when unambiguous, so a misread "R5" is never silently turned into some other resistor.
export function matchReference(text, items, model = emptyModel) {
  const label = normalizeLabel(stripPunctuation(text))
  if (!label) return null
  const exact = items.find((item) => item.label === label)
  if (exact) return { item: exact, exact: true, learned: false }
  // The drawing shows each triode of a dual triode on its own (V2A, V2B) while the BOM lists the tube once (V2).
  const section = splitSectionLabel(label)
  const dualItem = section && items.find((item) => item.label === section.base && dualTriodeOf(item))
  if (dualItem) return { item: dualItem, exact: true, learned: false, section: section.section }
  const learned = items.filter((item) => isLearnedMisread(label, item.label, model))
  if (learned.length === 1) return { item: learned[0], exact: false, learned: true }
  if (label.length < MIN_APPROXIMATE_LENGTH || isJumperLabel(label)) return null
  const near = labelCandidates(label, items, { strict: true })
  return near.length === 1 ? { item: near[0], exact: false, learned: false } : null
}

// The label the component carries in the drawing: V2A for the first triode of the BOM's V2.
const drawnLabel = (match) => (match.section ? `${match.item.label}${match.section}` : match.item.label)

const typeForMatch = (match, model) => (match.section ? triodeSectionType(dualTriodeOf(match.item)) : inferBomType(match.item, model))

// A BOM table lists its references in a tight vertical column; schematic labels are scattered.
function inTableColumn(candidate, all) {
  const tolerance = Math.max(8, candidate.word.height)
  const column = all.filter((other) => Math.abs(other.word.x - candidate.word.x) <= tolerance).sort((a, b) => a.word.y - b.word.y)
  let run = []
  for (const entry of column) {
    const previous = run[run.length - 1]
    if (previous && entry.word.y - previous.word.y > 3 * Math.max(previous.word.height, entry.word.height)) run = []
    run.push(entry)
    if (run.length >= MIN_TABLE_ROWS && run.includes(candidate)) return true
  }
  return false
}

const isBetter = (a, b) => (a.exact !== b.exact ? a.exact : a.word.confidence > b.word.confidence)

// Where the component should go: the symbol position learned from earlier assignments, else the label itself.
export function placeFor(word, type, model) {
  const labelCenter = [word.x + word.width / 2, word.y + word.height / 2]
  const offset = predictOffset(type, model)
  if (!offset) return { center: labelCenter, placement: 'label' }
  return { center: [labelCenter[0] + offset[0] * word.height, labelCenter[1] + offset[1] * word.height], placement: 'learned' }
}

// Finds BOM references among the OCR words of a circuit image and proposes a component for each one that is not
// already in the circuit; `jumpers` lists the jumper-style labels (J58) that are not BOM references and were left out. `box` is the label text; `center` is where the component is proposed.
// `trusted` proposals (exact or previously corrected matches) are safe to add in bulk.
export function detectBomComponents(words, bom, components, model = emptyModel) {
  const existing = new Set(components.map((component) => normalizeLabel(component.label)))
  const candidates = []
  const jumpers = new Set()
  for (const word of words) {
    const match = matchReference(word.text, bom, model)
    if (!match && isJumperLabel(stripPunctuation(word.text))) jumpers.add(normalizeLabel(stripPunctuation(word.text)))
    if (!match || existing.has(drawnLabel(match))) continue
    if (!match.exact && !match.learned && word.confidence < MIN_APPROXIMATE_CONFIDENCE) continue
    candidates.push({ word, ...match })
  }
  const scattered = candidates.filter((candidate) => !inTableColumn(candidate, candidates))
  const best = new Map()
  for (const candidate of scattered) {
    const key = drawnLabel(candidate)
    const current = best.get(key)
    if (!current || isBetter(candidate, current)) best.set(key, candidate)
  }
  const detections = []
  const untyped = []
  for (const match of best.values()) {
    const { item, word, exact, learned, section } = match
    const type = typeForMatch(match, model)
    if (!type) untyped.push(item.label)
    else {
      detections.push({
        label: drawnLabel(match),
        reference: item.label,
        ...(section ? { section } : {}),
        type,
        exact,
        trusted: exact || learned,
        text: word.text,
        confidence: word.confidence,
        box: [word.x, word.y, word.x + word.width, word.y + word.height],
        // Letter height of the label: vertical text runs along its box, so its letters are as tall as the box is wide.
        textHeight: word.orientation ? word.width : word.height,
        ...placeFor(word, type, model),
      })
    }
  }
  const byLabel = (a, b) => a.localeCompare(b, undefined, { numeric: true })
  detections.sort((a, b) => byLabel(a.label, b.label))
  // A dual triode counts as found when any of its sections is.
  const drawnLabels = (item) => (dualTriodeOf(item) ? [item.label, `${item.label}A`, `${item.label}B`] : [item.label])
  const missing = bom.filter((item) => !drawnLabels(item).some((label) => existing.has(label) || best.has(label))).length
  return { detections, untyped: untyped.sort(byLabel), skippedTable: candidates.length - scattered.length, missing, jumpers: [...jumpers].sort(byLabel) }
}
