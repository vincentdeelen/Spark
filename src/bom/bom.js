import { BOM_OPTIONAL_RATINGS, BOM_RATING_FIELDS, RATING_FIELDS, RATING_FIELD_NAMES, normalizeFuseSpeed, ratingFields } from '../circuit/ratings.js'
import { dualTriodeOf, dualTriodeOfSection, splitSectionLabel, typeForBom } from '../tubes/triodes.js'
import { library } from '../circuit/library.js'
import { normalizeLabel } from '../circuit/references.js'
import { tubeTypeFromText } from '../tubes/tubeNames.js'

// A BOM's Type cell: a toolbox type or name, "valve" for a tube, or a tube's equivalent name (ECC83 for the 12AX7).
function findTypeByName(text) {
  const wanted = text.trim().toLowerCase()
  const exact = library.find((item) => item.type.toLowerCase() === wanted || item.name.toLowerCase() === wanted)
  if (exact) return exact
  const tube = /^valves?$/.test(wanted) ? 'tube' : tubeTypeFromText(text)
  return library.find((item) => item.type === tube) ?? null
}

export function inferComponentType(label) {
  const prefix = normalizeLabel(label).match(/^[A-Z]+(?=\d)/)?.[0]
  return (
    {
      R: 'resistor',
      VR: 'variable-resistor',
      C: 'capacitor',
      D: 'diode',
      CR: 'diode',
      Q: 'transistor',
      K: 'relay',
      F: 'fuse',
      L: 'inductor',
      T: 'transformer',
      PT: 'power-transformer',
      OT: 'output-transformer',
      SW: 'switch',
    }[prefix] || ''
  )
}

export function namedCircuits(circuits) {
  const used = new Set()
  return circuits.map((circuit) => {
    let name = circuit.name
    let suffix = 2
    while (used.has(name.toLowerCase())) name = `${circuit.name} (${suffix++})`
    used.add(name.toLowerCase())
    return { ...circuit, bomName: name }
  })
}

export function matchBom(items, documentId, label) {
  const normalized = normalizeLabel(label)
  const inDocument = items.filter((item) => item.documentId === documentId)
  const exact = inDocument.find((item) => item.label === normalized)
  if (exact) return exact
  // A drawing labels each triode of a dual triode (V2A, V2B) while the BOM lists the tube once (V2).
  const section = splitSectionLabel(normalized)
  return section && inDocument.find((item) => item.label === section.base && dualTriodeOf(item))
}

const BOM_SPECIFICATION_FIELDS = ['type', 'value', ...BOM_RATING_FIELDS]
// Ratings with their own BOM column only when some component uses them, so BOMs without fuses keep their familiar columns.
const OPTIONAL_RATINGS = BOM_OPTIONAL_RATINGS
const OPTIONAL_COLUMN_TITLES = Object.fromEntries(OPTIONAL_RATINGS.map((field) => [field, RATING_FIELDS[field].bom.title]))
const optionalRatings = (read) => Object.fromEntries(OPTIONAL_RATINGS.map((field) => [field, read(field)]).filter(([, value]) => value))

// Applying a BOM to a circuit is ambiguous when two components share a matched reference.
export function assertUniqueMatchedReferences(circuits, rows) {
  for (const circuit of circuits) {
    const seen = new Set()
    for (const component of circuit.diagram.components) {
      const item = matchBom(rows, circuit.id, component.label)
      if (!item) continue
      const label = normalizeLabel(component.label)
      if (seen.has(label)) throw new Error(`Circuit "${circuit.name}" has multiple components labelled ${label}. Give them unique references before applying the BOM.`)
      seen.add(label)
    }
  }
}

// BOM specifications that would go out of date if the diagram moved from `current` to `next` (undo/redo).
export function historyBomUpdates(current, next, items, documentId) {
  const updates = []
  for (const component of next.components) {
    const before = current.components.find((item) => item.id === component.id)
    const item = matchBom(items, documentId, component.label)
    if (!before || !item) continue
    const changes = {}
    for (const field of BOM_SPECIFICATION_FIELDS) {
      const value = component[field] || ''
      // A triode section matches its BOM row's dual triode type.
      const bomValue = field === 'type' && dualTriodeOfSection(value) === item.type ? value : item[field] || ''
      if ((before[field] || '') !== value && bomValue !== value) changes[field] = value
    }
    if (Object.keys(changes).length) updates.push({ label: item.label, changes })
  }
  return updates
}

export function appendBom(existing, rows) {
  const keys = new Set(existing.map((item) => `${item.documentId}\u0000${item.label}`))
  for (const item of rows) {
    const key = `${item.documentId}\u0000${item.label}`
    if (keys.has(key)) throw new Error(`${item.label} already exists in this circuit's BOM. Remove the duplicate or replace that circuit's BOM instead.`)
    keys.add(key)
  }
  return [...existing, ...rows]
}

// Letters OCR mixes up with one another, and with digits, in reference prefixes. A prefix letter read as anything else
// (a J for an R) is a different part, not a misread.
const CONFUSABLE_PREFIX = [
  ['C', 'G'],
  ['C', 'O'],
  ['C', '0'],
  ['C', 'E'],
  ['D', 'O'],
  ['D', '0'],
  ['L', 'I'],
  ['L', '1'],
  ['L', 'T'],
  ['R', 'K'],
  ['R', 'P'],
  ['R', 'B'],
  ['R', 'A'],
  ['V', 'Y'],
  ['V', 'U'],
  ['Q', 'O'],
  ['Q', '0'],
  ['Q', 'G'],
  ['F', 'P'],
  ['F', 'E'],
  ['F', 'T'],
  ['K', 'X'],
  ['T', 'I'],
  ['T', '1'],
  ['S', '5'],
  ['B', '8'],
  ['W', 'V'],
  ['H', 'N'],
  ['M', 'N'],
]
const confusable = (a, b) => CONFUSABLE_PREFIX.some(([x, y]) => (x === a && y === b) || (x === b && y === a))

// The single edit that turns `target` into the OCR text `label`, or null when they are not one edit apart.
function singleEdit(label, target) {
  if (label.length === target.length) {
    const at = [...label].flatMap((char, index) => (char === target[index] ? [] : [index]))
    return at.length === 1 ? { kind: 'substitute', index: at[0] } : null
  }
  const [longer, shorter] = label.length > target.length ? [label, target] : [target, label]
  if (longer.length - shorter.length !== 1) return null
  let index = 0
  while (index < shorter.length && longer[index] === shorter[index]) index += 1
  return longer.slice(index + 1) === shorter.slice(index) ? { kind: label.length > target.length ? 'insert' : 'delete', index } : null
}

// A strict near match must read like OCR noise: a changed prefix letter has to be a letter OCR really confuses, and the text
// must have a letter prefix at all.
function plausibleMisread(label, target) {
  if (!/^[A-Z]/.test(label)) return false
  const edit = singleEdit(label, target)
  if (!edit) return false
  const prefixLength = target.match(/^[A-Z]+/)?.[0].length ?? 0
  if (edit.kind !== 'substitute' || edit.index >= prefixLength) return true
  const [from, to] = [target[edit.index], label[edit.index]]
  return confusable(from, to)
}

// BOM items whose reference is the text or one edit away from it. `strict` (used when proposing components without being
// asked) also requires the edit to be a plausible misreading; the manual "Find BOM labels" list stays permissive.
export function labelCandidates(text, items, { strict = false } = {}) {
  const label = normalizeLabel(text)
  return items.filter((item) => {
    if (item.label === label) return true
    if (Math.abs(item.label.length - label.length) > 1 || !/^[A-Z0-9]+$/.test(label)) return false
    return strict ? plausibleMisread(label, item.label) : singleEdit(label, item.label) !== null
  })
}

export function componentFromBom(component, item) {
  const type = typeForBom(item.type, component.type)
  const result = { ...component, type, ...(item.value ? { value: item.value } : {}) }
  const applicable = ratingFields(type)
  for (const field of RATING_FIELD_NAMES) {
    const value = field === 'speed' ? normalizeFuseSpeed(item.speed) : item[field]
    if (!applicable.includes(field)) delete result[field]
    else if (value) result[field] = value
  }
  return result
}

export function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  let closed = false
  const input = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        cell += '"'
        i += 1
      } else if (char === '"') {
        quoted = false
        closed = true
      } else cell += char
    } else if (char === '"' && !cell && !closed) quoted = true
    else if (char === ',' || char === '\n' || char === '\r') {
      row.push(cell)
      cell = ''
      closed = false
      if (char !== ',') {
        rows.push(row)
        row = []
        if (char === '\r' && input[i + 1] === '\n') i += 1
      }
    } else if (closed || char === '"') throw new Error('Invalid CSV quoting.')
    else cell += char
  }
  if (quoted) throw new Error('Unclosed quoted CSV field.')
  if (cell || row.length || closed) rows.push([...row, cell])
  return rows
}

const columnNames = {
  label: ['reference', 'references', 'ref', 'refdes', 'designator', 'designators', 'label'],
  circuit: ['circuit', 'sheet', 'document'],
  value: ['value', 'part value'],
  type: ['type', 'component type', 'subtype'],
  wattage: ['wattage', 'power', 'power rating', 'power rating (w)'],
  tolerance: ['tolerance', 'tolerance (%)', 'precision'],
  ...Object.fromEntries(OPTIONAL_RATINGS.map((field) => [field, RATING_FIELDS[field].bom.aliases])),
  description: ['description', 'specification', 'specifications'],
}

export function rowsToBom(rows, circuits, fallbackCircuitId) {
  const names = rows[0]?.map((value) => String(value ?? '').trim())
  const header = names?.map((value) => value.toLowerCase())
  if (!header) throw new Error('The BOM is empty.')
  if (header.some((value) => !value) || new Set(header).size !== header.length) throw new Error('Every BOM column must have a unique, nonempty heading.')
  const columns = Object.fromEntries(Object.entries(columnNames).map(([field, names]) => [field, header.findIndex((value) => names.includes(value))]))
  const knownColumns = new Set(Object.values(columns).filter((index) => index >= 0))
  if (columns.label < 0) throw new Error('The BOM needs a Reference or Designator column.')
  const result = []
  const seen = new Set()
  for (const [index, row] of rows.slice(1).entries()) {
    if (!row.some((cell) => String(cell ?? '').trim())) continue
    if (row.length > header.length) throw new Error(`Row ${index + 2}: more cells than column headings.`)
    const read = (field) => (columns[field] < 0 ? '' : String(row[columns[field]] ?? '').trim())
    const circuitName = read('circuit')
    const matchingCircuits = circuitName ? namedCircuits(circuits).filter((item) => item.bomName.toLowerCase() === circuitName.toLowerCase()) : []
    if (circuitName && matchingCircuits.length !== 1) throw new Error(`Row ${index + 2}: circuit "${circuitName}" is missing or ambiguous.`)
    const documentId = circuitName ? matchingCircuits[0].id : fallbackCircuitId
    if (!circuits.some((item) => item.id === documentId)) throw new Error(`Row ${index + 2}: choose a circuit for rows without a circuit column.`)
    const labels = read('label')
      .split(/[,;\s]+/)
      .filter(Boolean)
      .flatMap((raw) => {
        const label = normalizeLabel(raw)
        const range = label.match(/^([A-Z]+)(\d+)-([A-Z]+)(\d+)$/)
        if (!range) return [label]
        const start = Number(range[2])
        const end = Number(range[4])
        if (range[1] !== range[3] || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || end - start > 1000)
          throw new Error(`Row ${index + 2}: invalid reference range "${label}".`)
        const width = /^0\d/.test(range[2]) || /^0\d/.test(range[4]) ? Math.max(range[2].length, range[4].length) : 0
        return Array.from({ length: end - start + 1 }, (_, offset) => `${range[1]}${String(start + offset).padStart(width, '0')}`)
      })
    if (!labels.length || labels.some((label) => !/^[A-Z]+[0-9]+[A-Z]?$/.test(label))) throw new Error(`Row ${index + 2}: invalid reference designator.`)
    const typeText = read('type')
    const entry = typeText ? findTypeByName(typeText) : null
    if (typeText && !entry) throw new Error(`Row ${index + 2}: unknown component type "${typeText}".`)
    for (const label of labels) {
      const key = `${documentId}\u0000${label}`
      if (seen.has(key)) throw new Error(`Row ${index + 2}: duplicate ${label} in the same circuit.`)
      seen.add(key)
      const specifications = Object.fromEntries(
        names
          .map((name, position) => [name, position])
          .filter(([, position]) => !knownColumns.has(position))
          .map(([name, position]) => [name, String(row[position] ?? '').trim()]),
      )
      result.push({
        documentId,
        label,
        type: entry?.type || '',
        value: read('value'),
        wattage: read('wattage'),
        tolerance: read('tolerance'),
        description: read('description'),
        ...optionalRatings((field) => (field === 'speed' ? normalizeFuseSpeed(read(field)) || read(field) : read(field))),
        specifications,
      })
    }
  }
  if (!result.length) throw new Error('The BOM contains no components.')
  return validateBom(result, new Set(circuits.map((item) => item.id)))
}

export function validateBom(items, documentIds) {
  if (!Array.isArray(items) || items.length > 10000) throw new Error('Invalid project BOM.')
  const seen = new Set()
  return items.map((item) => {
    const fields = ['documentId', 'label', 'type', 'value', 'wattage', 'tolerance', 'description']
    const optional = item ? OPTIONAL_RATINGS.filter((field) => item[field] !== undefined) : []
    if (
      !item ||
      fields.some((field) => typeof item[field] !== 'string' || item[field].length > 1000) ||
      optional.some((field) => typeof item[field] !== 'string' || item[field].length > 1000) ||
      !documentIds.has(item.documentId) ||
      !/^[A-Z]+[0-9]+[A-Z]?$/.test(item.label) ||
      (item.type && !library.some((entry) => entry.type === item.type))
    )
      throw new Error('Invalid project BOM item.')
    if (
      item.specifications !== undefined &&
      (!item.specifications ||
        typeof item.specifications !== 'object' ||
        Array.isArray(item.specifications) ||
        Object.entries(item.specifications).some(([key, value]) => !key.trim() || key.length > 1000 || typeof value !== 'string' || value.length > 1000))
    )
      throw new Error('Invalid project BOM specifications.')
    const key = `${item.documentId}\u0000${item.label}`
    if (seen.has(key)) throw new Error('Duplicate project BOM item.')
    seen.add(key)
    return foldBuiltInColumns({ ...Object.fromEntries([...fields, ...optional].map((field) => [field, item[field]])), specifications: { ...item.specifications } })
  })
}

// A column added by hand under the name of one the BOM has anyway ("Voltage", "Tolerance") is that column: its text moves to the
// part's own field unless that already has a value.
const BUILT_IN_COLUMNS = Object.fromEntries([
  ['value', 'value'],
  ['wattage', 'wattage'],
  ['tolerance', 'tolerance'],
  ['description', 'description'],
  ...OPTIONAL_RATINGS.map((field) => [OPTIONAL_COLUMN_TITLES[field].toLowerCase(), field]),
])
export const isBuiltInColumn = (name) => name.trim().toLowerCase() in BUILT_IN_COLUMNS || ['circuit', 'reference', 'type'].includes(name.trim().toLowerCase())

function foldBuiltInColumns(item) {
  const specifications = {}
  const folded = { ...item }
  for (const [name, text] of Object.entries(item.specifications)) {
    const field = BUILT_IN_COLUMNS[name.trim().toLowerCase()]
    if (!field) specifications[name] = text
    else if (!folded[field]) folded[field] = text
  }
  return { ...folded, specifications }
}

// The BOM for the components of `circuits`, one row per part. Where `existing` rows list the same reference in the same circuit,
// their description and extra columns are kept, and so are ratings the circuit does not give: the circuit says what the part is,
// the BOM may know more about it.
export function generateBom(circuits, existing = []) {
  const result = []
  for (const circuit of circuits) {
    const listed = new Set()
    for (const component of circuit.diagram.components) {
      let label = normalizeLabel(component.label)
      if (component.type === 'ground') continue
      if (!/^[A-Z]+[0-9]+[A-Z]?$/.test(label)) throw new Error(`Circuit "${circuit.name}" has a component with an invalid reference "${component.label}".`)
      // Both triode sections of a dual triode are one part: list the tube once under its base reference.
      const dual = dualTriodeOfSection(component.type)
      if (dual) {
        label = splitSectionLabel(label)?.base ?? label
        if (listed.has(label)) continue
        listed.add(label)
      }
      const previous = existing.find((item) => item.documentId === circuit.id && item.label === label)
      result.push({
        documentId: circuit.id,
        label,
        type: dual || component.type,
        value: component.value,
        wattage: ratingFields(component.type).includes('wattage') ? component.wattage || previous?.wattage || '' : '',
        tolerance: ratingFields(component.type).includes('tolerance') ? component.tolerance || previous?.tolerance || '' : '',
        description: previous?.description ?? '',
        ...optionalRatings((field) => (ratingFields(component.type).includes(field) ? component[field] || previous?.[field] || '' : '')),
        specifications: { ...previous?.specifications },
      })
    }
  }
  return validateBom(result, new Set(circuits.map((item) => item.id)))
}

export function spreadsheetCsv(rows) {
  const quote = (value) => {
    const text = String(value)
    const safe = /^[=+\-@]/.test(text.trimStart()) ? `\t${text}` : text
    return `"${safe.replaceAll('"', '""')}"`
  }
  return rows.map((row) => row.map(quote).join(',')).join('\r\n')
}

export function bomToRows(items, circuits) {
  const names = new Map(namedCircuits(circuits).map((item) => [item.id, item.bomName]))
  const extraColumns = [...new Set(items.flatMap((item) => Object.keys(item.specifications || {})))]
  // The voltage rating sits right after the value, as on a parts list; the other ratings follow the description.
  const hasVoltage = items.some((item) => item.voltage)
  const ratingColumns = OPTIONAL_RATINGS.filter((field) => field !== 'voltage' && items.some((item) => item[field]))
  return [
    [
      'Circuit',
      'Reference',
      'Type',
      'Value',
      ...(hasVoltage ? [OPTIONAL_COLUMN_TITLES.voltage] : []),
      'Wattage',
      'Tolerance',
      'Description',
      ...ratingColumns.map((field) => OPTIONAL_COLUMN_TITLES[field]),
      ...extraColumns,
    ],
    ...items.map((item) => [
      names.get(item.documentId),
      item.label,
      item.type,
      item.value,
      ...(hasVoltage ? [item.voltage || ''] : []),
      item.wattage,
      item.tolerance,
      item.description,
      ...ratingColumns.map((field) => item[field] || ''),
      ...extraColumns.map((column) => item.specifications?.[column] || ''),
    ]),
  ]
}

export function bomToCsv(items, circuits) {
  return spreadsheetCsv(bomToRows(items, circuits))
}
