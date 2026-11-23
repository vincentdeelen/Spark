import test from 'node:test'
import assert from 'node:assert/strict'
import {
  appendBom,
  bomToCsv,
  bomToRows,
  componentFromBom,
  generateBom,
  historyBomUpdates,
  inferComponentType,
  labelCandidates,
  parseCsv,
  rowsToBom,
  spreadsheetCsv,
  validateBom,
} from './bom.js'
import { csvRow, findBomTables } from './bomExtraction.js'

const circuits = [
  { id: 'a', name: 'Preamp', diagram: { components: [{ label: 'R1', type: 'resistor', value: '1 kΩ', wattage: '0.25', tolerance: '5' }] } },
  { id: 'b', name: 'Power', diagram: { components: [{ label: 'R1', type: 'resistor', value: '10 kΩ' }] } },
]

test('CSV supports quoted values, grouped references, and circuit-specific matching', () => {
  const rows = parseCsv('Circuit,Reference,Value,Description\r\nPreamp,"R1, R2","1 kΩ","film, 1%"\r\nPower,R1,10 kΩ,')
  const result = rowsToBom(rows, circuits, '')
  assert.deepEqual(
    result.map((item) => [item.documentId, item.label, item.value]),
    [
      ['a', 'R1', '1 kΩ'],
      ['a', 'R2', '1 kΩ'],
      ['b', 'R1', '10 kΩ'],
    ],
  )
  assert.equal(result[0].description, 'film, 1%')
  assert.throws(() => parseCsv('Reference,Value\nR1,"bad'), /Unclosed/)
  assert.throws(() => rowsToBom(parseCsv('Reference,Value\nR1,1k\nr1,2k'), circuits, 'a'), /duplicate/)
  assert.throws(() => rowsToBom(parseCsv('Circuit,Reference\nUnknown,R1'), circuits, ''), /missing or ambiguous/)
  assert.deepEqual(
    rowsToBom(parseCsv('Reference,Value\nR3-R5,10k'), circuits, 'a').map((item) => item.label),
    ['R3', 'R4', 'R5'],
  )
  assert.throws(() => rowsToBom(parseCsv('Reference,Value\nR2-C4,10k'), circuits, 'a'), /invalid reference range/)
})

test('generated BOMs preserve independent circuits and export-import values', () => {
  const bom = generateBom(circuits)
  assert.deepEqual(rowsToBom(parseCsv(bomToCsv(bom, circuits)), circuits, ''), bom)
  assert.deepEqual(validateBom(bom, new Set(['a', 'b'])), bom)
  assert.throws(() => validateBom(bom, new Set(['a'])), /Invalid/)
})

test('OCR label candidates include small errors for explicit review', () => {
  const items = [{ label: 'CR5' }, { label: 'R1' }, { label: 'C3' }]
  assert.deepEqual(labelCandidates('CRS', items), [items[0]])
  assert.deepEqual(labelCandidates('R1', items), [items[1]])
  assert.deepEqual(labelCandidates('unrelated', items), [])
  assert.equal(inferComponentType('CR5'), 'diode')
  assert.equal(inferComponentType('F1'), 'fuse')
  assert.equal(inferComponentType('V1'), '')
})

test('preserves extra specifications and safely exports spreadsheet formulas', () => {
  const rows = parseCsv('Reference,Value,Manufacturer,Part Number\nR1,-5 V,Example,=1+1')
  const bom = rowsToBom(rows, circuits, 'a')
  assert.deepEqual(bom[0].specifications, { Manufacturer: 'Example', 'Part Number': '=1+1' })
  const csv = bomToCsv(bom, circuits)
  assert.match(csv, /"\t=1\+1"/)
  assert.deepEqual(rowsToBom(parseCsv(csv), circuits, 'a'), bom)
  assert.equal(bomToRows(bom, circuits)[1].at(-1), '=1+1')
  assert.deepEqual(
    parseCsv(
      spreadsheetCsv([
        ['=heading', 'value'],
        [' +cmd', '@cmd'],
      ]),
    ),
    [
      ['\t=heading', 'value'],
      ['\t +cmd', '\t@cmd'],
    ],
  )
})

test('applies matching BOM values and clears resistor-only properties when changing type', () => {
  const component = { type: 'resistor', label: 'R1', value: '10 Ω', wattage: '1', tolerance: '5' }
  assert.deepEqual(componentFromBom(component, { type: 'diode', value: '1N4007' }), { type: 'diode', label: 'R1', value: '1N4007' })
  assert.deepEqual(componentFromBom(component, { type: '', value: '', wattage: '', tolerance: '' }), component)
})

test('same circuit names remain distinct in exported and reimported BOMs', () => {
  const copies = circuits.map((circuit) => ({ ...circuit, name: 'Circuit' }))
  const generated = generateBom(copies)
  assert.deepEqual(rowsToBom(parseCsv(bomToCsv(generated, copies)), copies, ''), generated)
})

test('detects BOM tables among drawing text without importing surrounding schematic labels', () => {
  const word = (text, x, y, width = 25) => ({ text, x, y, width, height: 10 })
  const words = [
    word('R99', 15, 5),
    word('diagram', 80, 5),
    word('Ref.', 10, 30),
    word('Value', 90, 30),
    word('Part Number', 170, 30, 50),
    word('R1, R2', 10, 50, 40),
    word('10k', 90, 50),
    word('ABC-1', 170, 50),
    word('C3', 10, 70),
    word('1uF', 90, 70),
    word('XYZ', 170, 70),
    word('NOTES', 10, 90),
    word('diagram', 10, 110),
    word('Reference', 10, 140, 50),
    word('Description', 90, 140, 60),
    word('CR5', 10, 160),
    word('Diode', 90, 160),
  ]
  const tables = findBomTables(words)
  assert.equal(tables.length, 2)
  const first = rowsToBom(parseCsv(tables[0].map(csvRow).join('\n')), circuits, 'a')
  assert.deepEqual(
    first.map((item) => item.label),
    ['R1', 'R2', 'C3'],
  )
  assert.equal(first[0].specifications['Part Number'], 'ABC-1')
  assert.deepEqual(tables[1], [
    ['Reference', 'Description'],
    ['CR5', 'Diode'],
  ])
  assert.deepEqual(findBomTables([word('R1', 10, 10), word('1k', 80, 10)]), [])
  assert.deepEqual(findBomTables([word('Reference', 10, 10), word('Value', 90, 10), word('note', 10, 30)]), [])
})

test('detects skewed two-column parts lists and retains uncertain references for review', () => {
  const word = (text, x, y, width = 15) => ({ text, x, y: y + (x - 10) * 0.02, width, height: 10 })
  const words = [
    word('NAME', 10, 20, 25),
    word('VALUE', 60, 20, 30),
    word('NUMBER', 120, 20, 35),
    word('DESCRIPTION', 200, 20, 50),
    ...[
      ['R1', '1k', '12345678', 'RESISTOR'],
      ['C2', '10u', '12345679', 'CAPACITOR'],
      ['?3', '2k', '12345680', 'CHECK'],
    ].flatMap(([ref, value, number, description], index) => [
      word(ref, 10, 50 + index * 20),
      word(value, 50, 50 + index * 20),
      word(number, index === 0 ? 85 : 100, 50 + index * 20),
      word(description, 190, 50 + index * 20),
    ]),
    ...[
      ['D4', '1N', '87654321', 'DIODE'],
      ['R5', '4k', '87654322', 'RESISTOR'],
      ['C6', '1u', '87654323', 'CAPACITOR'],
    ].flatMap(([ref, value, number, description], index) => [
      word(ref, 300, 50 + index * 20),
      word(value, 340, 50 + index * 20),
      word(number, 390, 50 + index * 20),
      word(description, 480, 50 + index * 20),
    ]),
  ]
  const [table] = findBomTables(words)
  assert.deepEqual(table, [
    ['Reference', 'Value', 'Part Number', 'Description'],
    ['R1', '1k', '12345678', 'RESISTOR'],
    ['C2', '10u', '12345679', 'CAPACITOR'],
    ['?3', '2k', '12345680', 'CHECK'],
    ['D4', '1N', '87654321', 'DIODE'],
    ['R5', '4k', '87654322', 'RESISTOR'],
    ['C6', '1u', '87654323', 'CAPACITOR'],
  ])
  assert.throws(() => rowsToBom(table, circuits, 'a'), /invalid reference/)
})

test('history steps only report BOM fields that change away from the BOM value', () => {
  const bom = [{ documentId: 'a', label: 'R1', type: 'resistor', value: '1 kΩ', wattage: '', tolerance: '', description: '', specifications: {} }]
  const resistor = (value, wattage) => ({ id: 'r', type: 'resistor', label: 'r1', value, ...(wattage ? { wattage } : {}) })
  const diagram = (...components) => ({ components })
  assert.deepEqual(historyBomUpdates(diagram(resistor('1 kΩ')), diagram(resistor('2 kΩ', '1')), bom, 'a'), [{ label: 'R1', changes: { value: '2 kΩ', wattage: '1' } }])
  assert.deepEqual(historyBomUpdates(diagram(resistor('2 kΩ')), diagram(resistor('1 kΩ')), bom, 'a'), [])
  assert.deepEqual(historyBomUpdates(diagram(resistor('1 kΩ')), diagram(resistor('2 kΩ')), bom, 'other'), [])
  assert.deepEqual(historyBomUpdates(diagram(), diagram(resistor('2 kΩ')), bom, 'a'), [])
})

test('adding detected rows preserves other BOM rows and refuses duplicates in the same circuit', () => {
  const existing = rowsToBom(parseCsv('Reference,Value\nR1,10k'), circuits, 'a')
  const additional = rowsToBom(parseCsv('Reference,Value\nC3,1uF'), circuits, 'a')
  assert.deepEqual(
    appendBom(existing, additional).map((item) => item.label),
    ['R1', 'C3'],
  )
  assert.throws(() => appendBom(existing, existing), /already exists/)
  assert.equal(appendBom(existing, rowsToBom(parseCsv('Reference,Value\nR1,22k'), circuits, 'b')).length, 2)
})
