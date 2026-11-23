import { library } from '../circuit/library.js'
import { normalizeLabel } from '../circuit/references.js'

const key = 'live-wire-reference-learning-v1'
const MAX_RECORDS = 200
const MAX_OFFSET = 40
const types = new Set(library.map((item) => item.type))
const tubeTypes = new Set(library.filter((item) => item.category === 'TUBES').map((item) => item.type))

const clean = (text) => normalizeLabel(text.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, ''))
export const referencePrefix = (label) => normalizeLabel(label).match(/^[A-Z]+(?=\d)/)?.[0] || ''

function validRecord(item) {
  return (
    item &&
    typeof item.reference === 'string' &&
    /^[A-Z]+[0-9]+[A-Z]?$/.test(item.reference) &&
    item.prefix === referencePrefix(item.reference) &&
    types.has(item.type) &&
    typeof item.text === 'string' &&
    item.text.length <= 20 &&
    (item.offset === null || (Array.isArray(item.offset) && item.offset.length === 2 && item.offset.every((value) => Number.isFinite(value) && Math.abs(value) <= MAX_OFFSET)))
  )
}

export function readAssignments(storage = localStorage) {
  const raw = storage.getItem(key)
  if (!raw) return []
  let records
  try {
    records = JSON.parse(raw)
  } catch {
    throw new Error('Learned references are damaged. Clear examples to start again.')
  }
  if (!Array.isArray(records) || records.length > MAX_RECORDS || !records.every(validRecord)) throw new Error('Learned references are invalid. Clear examples to start again.')
  return records
}

// The newest assignments are kept when the library is full, so recent corrections always count.
export function saveAssignment(record, storage = localStorage) {
  if (!validRecord(record)) throw new Error('This reference assignment is not valid.')
  storage.setItem(key, JSON.stringify([...readAssignments(storage), record].slice(-MAX_RECORDS)))
}

export function clearAssignments(storage = localStorage) {
  storage.removeItem(key)
}

const center = (box) => [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]

// One user decision: this text/symbol in the image is BOM reference `reference` of component type `type`.
// `labelBox` is the OCR text, `symbolBox` the marked symbol; both are optional and in image pixels.
export function createAssignment({ reference, type, text = '', labelBox = null, symbolBox = null }) {
  const label = normalizeLabel(reference)
  let offset = null
  const height = labelBox ? labelBox[3] - labelBox[1] : 0
  if (labelBox && symbolBox && height >= 4) {
    const [lx, ly] = center(labelBox)
    const [sx, sy] = center(symbolBox)
    offset = [Math.round(((sx - lx) / height) * 1000) / 1000, Math.round(((sy - ly) / height) * 1000) / 1000]
  }
  const record = { reference: label, prefix: referencePrefix(label), type, text: clean(text).slice(0, 20), offset }
  if (!validRecord(record)) throw new Error('This reference assignment is not valid.')
  return record
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
const medianOffset = (offsets) => (offsets.length ? [median(offsets.map((offset) => offset[0])), median(offsets.map((offset) => offset[1]))] : null)

export const emptyModel = { prefixTypes: {}, confusions: {}, offsets: { byType: {}, global: null }, count: 0 }

// Derives what has been learned from the assignments:
// - prefixTypes: the type most often chosen for each reference prefix (newest wins a tie)
// - confusions: OCR character misreads, as "read>actual" counts
// - offsets: the typical symbol position relative to its label, in label heights
export function learnReferenceModel(records) {
  const typeCounts = {}
  const confusions = {}
  const offsetsByType = {}
  const allOffsets = []
  for (const record of records) {
    // Tubes all share the prefix V, so which one a reference is comes from the BOM, not from the prefix.
    if (record.prefix && !tubeTypes.has(record.type)) {
      typeCounts[record.prefix] ||= {}
      typeCounts[record.prefix][record.type] = (typeCounts[record.prefix][record.type] || 0) + 1
    }
    if (record.text && record.text.length === record.reference.length && record.text !== record.reference) {
      const differing = [...record.text].flatMap((char, index) => (char === record.reference[index] ? [] : [`${char}>${record.reference[index]}`]))
      if (differing.length <= 2) differing.forEach((pair) => (confusions[pair] = (confusions[pair] || 0) + 1))
    }
    if (record.offset) {
      ;(offsetsByType[record.type] ||= []).push(record.offset)
      allOffsets.push(record.offset)
    }
  }
  const prefixTypes = {}
  for (const [prefix, counts] of Object.entries(typeCounts)) {
    const newestFirst = [...records].reverse().filter((record) => record.prefix === prefix)
    prefixTypes[prefix] = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || newestFirst.findIndex((r) => r.type === a) - newestFirst.findIndex((r) => r.type === b))[0]
  }
  return {
    prefixTypes,
    confusions,
    offsets: {
      byType: Object.fromEntries(Object.entries(offsetsByType).map(([type, offsets]) => [type, medianOffset(offsets)])),
      global: allOffsets.length >= 2 ? medianOffset(allOffsets) : null,
    },
    count: records.length,
  }
}

// True when `text` differs from `label` only at characters the user has previously corrected the same way.
export function isLearnedMisread(text, label, model) {
  if (text.length !== label.length || text === label) return false
  return [...text].every((char, index) => char === label[index] || model.confusions[`${char}>${label[index]}`] > 0)
}

// Where the symbol is expected relative to a label of the given height, if anything has been learned.
export function predictOffset(type, model) {
  return model.offsets.byType[type] || model.offsets.global
}
