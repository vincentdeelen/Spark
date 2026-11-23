export function csvRow(cells) {
  return cells.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')
}

export const rowsToEditableCsv = (rows) => rows.map(csvRow).join('\n')

// Tables from `additional` that are not already present in `existing`.
export function newTables(existing, additional) {
  const known = new Set(existing.map((table) => JSON.stringify(table)))
  return additional.filter((table) => !known.has(JSON.stringify(table)))
}

function wordLines(words) {
  const lines = []
  for (const word of [...words].sort((a, b) => a.y - b.y || a.x - b.x)) {
    let line = lines.find((item) => Math.abs(item.y - word.y) < Math.max(3, word.height * 0.5))
    if (!line) {
      line = { y: word.y, words: [] }
      lines.push(line)
    }
    line.words.push(word)
  }
  return lines.map(({ words: line }) => {
    const cells = []
    let previous
    for (const word of line.sort((a, b) => a.x - b.x)) {
      if (!previous || word.x - (previous.x + previous.width) > Math.max(12, previous.height)) cells.push({ text: word.text, x: word.x })
      else cells[cells.length - 1].text += ` ${word.text}`
      previous = word
    }
    return cells
  })
}

function alignRow(line, header) {
  const cells = Array(header.length).fill('')
  for (const cell of line) {
    let column = 0
    while (column + 1 < header.length && cell.x >= (header[column].x + header[column + 1].x) / 2) column += 1
    cells[column] += `${cells[column] ? ' ' : ''}${cell.text}`
  }
  return cells
}

export function wordsToRows(words) {
  const grouped = wordLines(words)
  const headerIndex = grouped.findIndex((line) => line.some((cell) => /^(reference|references|ref|refdes|designator|designators|label)$/i.test(cell.text)))
  if (headerIndex < 0) return grouped.map((line) => line.map((cell) => cell.text))
  const header = grouped[headerIndex]
  return grouped.slice(headerIndex).map((line) => alignRow(line, header))
}

function headerName(text) {
  const normalized = text.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (
    [
      'ref',
      'reference',
      'references',
      'refdes',
      'refdesignator',
      'referencedesignator',
      'designator',
      'designators',
      'designation',
      'refno',
      'refnumber',
      'referenceno',
      'referencenumber',
      'label',
    ].includes(normalized)
  )
    return 'Reference'
  if (['value', 'partvalue'].includes(normalized)) return 'Value'
  if (['type', 'componenttype', 'subtype'].includes(normalized)) return 'Type'
  if (['description', 'specification', 'specifications'].includes(normalized)) return 'Description'
  if (['power', 'wattage', 'powerrating', 'powerratingw'].includes(normalized)) return 'Wattage'
  if (['tolerance', 'tolerancepercent', 'precision'].includes(normalized)) return 'Tolerance'
  if (['partno', 'partnumber'].includes(normalized)) return 'Part Number'
  if (['qty', 'quantity'].includes(normalized)) return 'Quantity'
  return text.trim()
}

function isReferenceList(value) {
  const parts = value
    .trim()
    .split(/[,;\s]+/)
    .filter(Boolean)
  return parts.length > 0 && parts.every((part) => /^[A-Z]+\d+[A-Z]?(?:-[A-Z]+\d+[A-Z]?)?$/i.test(part))
}

function findPartsList(words) {
  const grouped = wordLines(words)
  let heading
  for (const line of grouped) {
    const name = line.find((cell) => /^name$/i.test(cell.text))
    const value = line.find((cell) => /^value$/i.test(cell.text))
    const number = line.find((cell) => /^(?:part\s*)?number$/i.test(cell.text))
    const description = line.find((cell) => /^description$/i.test(cell.text))
    if (name && value && number && description && name.x < value.x && value.x < number.x && number.x < description.x) {
      const source = words.find((word) => word.x === name.x && /^name$/i.test(word.text))
      if (source) {
        heading = { name, value, number, description, source }
        break
      }
    }
  }
  if (!heading) return null
  const { name, number, description, source } = heading
  const height = Math.max(6, source.height)
  const minimumWidth = description.x + height - name.x
  const references = words.filter((word) => word.y >= source.y - height && isReferenceList(word.text))
  const anchors = [name.x]
  const remaining = references.filter((word) => word.x >= name.x + minimumWidth)
  while (remaining.length) {
    let best = []
    for (const word of remaining) {
      const nearby = remaining.filter((item) => Math.abs(item.x - word.x) <= height * 1.5)
      if (nearby.length > best.length) best = nearby
    }
    if (best.length < 3) break
    const xs = best.map((word) => word.x).sort((a, b) => a - b)
    const anchor = xs[Math.floor(xs.length / 2)]
    if (anchors.every((other) => Math.abs(other - anchor) >= minimumWidth)) anchors.push(anchor)
    for (let i = remaining.length - 1; i >= 0; i -= 1) {
      if (Math.abs(remaining[i].x - anchor) < minimumWidth) remaining.splice(i, 1)
    }
  }
  anchors.sort((a, b) => a - b)
  const headerWords = [name, heading.value, number, description].map((cell) => words.find((word) => cell.x === word.x && cell.text === word.text)).filter(Boolean)
  const slope = headerWords.length > 1 ? Math.max(-0.05, Math.min(0.05, (headerWords.at(-1).y - headerWords[0].y) / (headerWords.at(-1).x - headerWords[0].x))) : 0
  const rows = []
  for (let column = 0; column < anchors.length; column += 1) {
    const anchor = anchors[column]
    const left = anchor - height * 2
    const right = column + 1 < anchors.length ? anchors[column + 1] - height * 2 : Infinity
    const lines = []
    const columnWords = words
      .filter((word) => word.x >= left && word.x < right && word.y >= source.y + (column === 0 ? height : -height))
      .map((word) => ({ ...word, adjustedY: word.y - slope * (word.x - anchor) }))
      .sort((a, b) => a.adjustedY - b.adjustedY || a.x - b.x)
    for (const word of columnWords) {
      let line = lines.find((item) => Math.abs(item.y - word.adjustedY) < height * 0.7)
      if (!line) {
        line = { y: word.adjustedY, words: [] }
        lines.push(line)
      }
      line.words.push(word)
    }
    for (const line of lines) {
      const ordered = line.words.sort((a, b) => a.x - b.x)
      const referenceWords = ordered.filter((word) => word.x <= anchor + height * 2)
      const reference = referenceWords.map((word) => word.text).join(' ')
      if (!reference) continue
      const rest = ordered.filter((word) => word.x > anchor + height * 2)
      const numberStart = anchor + number.x - name.x - height * 3
      const descriptionStart = anchor + description.x - name.x - height * 2
      let part = rest.findIndex((word) => word.x >= numberStart - height * 2 && word.x < descriptionStart && /^\d{6,}$/.test(word.text))
      if (part < 0) part = rest.findIndex((word) => word.x >= numberStart && word.x < descriptionStart && word.text.length >= 6 && (word.text.match(/\d/g) || []).length >= 4)
      let value
      let partNumber
      let details
      if (part >= 0) {
        value = rest
          .slice(0, part)
          .map((word) => word.text)
          .join(' ')
        partNumber = rest[part].text
        details = rest
          .slice(part + 1)
          .map((word) => word.text)
          .join(' ')
      } else {
        value = rest
          .filter((word) => word.x < numberStart)
          .map((word) => word.text)
          .join(' ')
        partNumber = rest
          .filter((word) => word.x >= numberStart && word.x < descriptionStart)
          .map((word) => word.text)
          .join(' ')
        details = rest
          .filter((word) => word.x >= descriptionStart)
          .map((word) => word.text)
          .join(' ')
      }
      if (rest.length && (isReferenceList(reference) || part >= 0)) rows.push([reference, value, partNumber, details])
    }
  }
  return rows.length >= 3 ? [['Reference', 'Value', 'Part Number', 'Description'], ...rows] : null
}

export function findBomTables(words) {
  const partsList = findPartsList(words)
  if (partsList) return [partsList]
  const lines = wordLines(words)
  const tables = []
  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index]
    const names = header.map((cell) => headerName(cell.text))
    const reference = names.indexOf('Reference')
    if (reference < 0 || !names.some((name, column) => column !== reference && /^(value|type|description|wattage|tolerance|part(?: number| no\.?)?|quantity|qty)$/i.test(name)))
      continue
    if (new Set(names.map((name) => name.toLowerCase())).size !== names.length) continue
    const rows = []
    let lastValid = -1
    let misses = 0
    let next = index + 1
    for (; next < lines.length && misses < 2; next += 1) {
      const row = alignRow(lines[next], header)
      rows.push(row)
      if (isReferenceList(row[reference]) && row.some((value, column) => column !== reference && value.trim())) {
        lastValid = rows.length - 1
        misses = 0
      } else misses += 1
    }
    if (lastValid >= 0) {
      tables.push([names, ...rows.slice(0, lastValid + 1)])
      index = index + lastValid + 1
    }
  }
  return tables
}
