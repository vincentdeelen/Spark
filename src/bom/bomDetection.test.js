import test from 'node:test'
import assert from 'node:assert/strict'
import { detectBomComponents, inferBomType, matchReference } from './bomDetection.js'
import { createAssignment, learnReferenceModel } from '../importing/referenceLearning.js'

const item = (label, extra = {}) => ({ documentId: 'a', label, type: '', value: '', wattage: '', tolerance: '', description: '', specifications: {}, ...extra })
const word = (text, x, y, confidence = 90) => ({ text, x, y, width: 24, height: 10, confidence })

const bom = [item('R1', { type: 'resistor' }), item('R2'), item('C3', { value: '1uF' }), item('CR5'), item('V1', { value: 'EL84', description: 'EL-84 TUBE' }), item('X9')]

test('BOM types come from the item, the reference prefix, or a tube named in its value', () => {
  assert.equal(inferBomType(item('R1', { type: 'potentiometer' })), 'potentiometer')
  assert.equal(inferBomType(item('R2')), 'resistor')
  assert.equal(inferBomType(item('CR5')), 'diode')
  assert.equal(inferBomType(bom[4]), 'el84')
  assert.equal(inferBomType(item('V2', { description: 'Power TUBE' })), 'tube')
  assert.equal(inferBomType(item('X9')), '')
})

test('exact references win while near misses are accepted only when unambiguous', () => {
  assert.deepEqual(matchReference('(r1)', bom), { item: bom[0], exact: true, learned: false })
  assert.equal(matchReference('R7', bom), null)
  assert.deepEqual(matchReference('CRS', bom), { item: bom[3], exact: false, learned: false })
  assert.equal(matchReference('R', bom), null)
})

test('detects typed components at their labels, skipping ones already drawn and untyped references', () => {
  const words = [word('R1', 100, 100), word('C3', 200, 100), word('C3', 400, 300, 40), word('CRS', 300, 200), word('V1', 50, 50), word('X9', 500, 500), word('noise', 1, 1)]
  const result = detectBomComponents(words, bom, [{ label: 'v1' }])
  assert.deepEqual(
    result.detections.map((entry) => [entry.label, entry.type, entry.exact]),
    [
      ['C3', 'capacitor', true],
      ['CR5', 'diode', false],
      ['R1', 'resistor', true],
    ],
  )
  assert.deepEqual(result.detections.find((entry) => entry.label === 'C3').box, [200, 100, 224, 110])
  assert.deepEqual(result.untyped, ['X9'])
  assert.equal(result.missing, 1)
})

test('a column of aligned, tightly spaced references is treated as a BOM table, not a circuit', () => {
  const table = Array.from({ length: 8 }, (_, index) => item(`R${index + 1}`, { type: 'resistor' }))
  const column = table.map((entry, index) => word(entry.label, 100, 100 + index * 14))
  const result = detectBomComponents([...column, word('C3', 300, 80)], [...table, bom[2]], [])
  assert.deepEqual(
    result.detections.map((entry) => entry.label),
    ['C3'],
  )
  assert.equal(result.skippedTable, 8)
  const scattered = table.slice(0, 6).map((entry, index) => word(entry.label, 100, 100 + index * 90))
  assert.equal(detectBomComponents(scattered, table, []).detections.length, 6)
})

test('learned misreads, prefix types and symbol offsets change what is detected and where it is placed', () => {
  const items = [item('CR5'), item('CR8'), item('VR1')]
  const words = [word('CRS', 100, 100), word('VR1', 300, 300)]
  const before = detectBomComponents(words, items, [])
  assert.deepEqual(
    before.detections.map((entry) => [entry.label, entry.type, entry.placement]),
    [['VR1', 'variable-resistor', 'label']],
  )
  const labelBox = [100, 100, 124, 110]
  const model = learnReferenceModel([
    createAssignment({ reference: 'CR5', type: 'diode', text: 'CRS', labelBox, symbolBox: [100, 130, 124, 150] }),
    createAssignment({ reference: 'VR9', type: 'potentiometer', text: 'VR9' }),
  ])
  const after = detectBomComponents(words, items, [], model)
  assert.deepEqual(
    after.detections.map((entry) => [entry.label, entry.type, entry.trusted, entry.exact, entry.placement]),
    [
      ['CR5', 'diode', true, false, 'learned'],
      ['VR1', 'potentiometer', true, true, 'label'],
    ],
  )
  assert.deepEqual(after.detections[0].center, [112, 140])
  assert.equal(inferBomType(items[2], model), 'potentiometer')
})

const resistors = [item('R18'), item('R35'), item('R58'), item('R22'), item('VR7'), item('CR2'), item('J1'), item('J10')]

test('a jumper label is never turned into the resistor with the same number', () => {
  assert.equal(matchReference('J58', resistors), null)
  assert.equal(matchReference('J18', resistors), null)
  assert.equal(matchReference('JP58', resistors), null)
  // Nor into a jumper-style reference that is one character away.
  assert.equal(matchReference('J11', resistors), null)
  // A jumper that is in the BOM is still an exact match.
  assert.equal(matchReference('J10', resistors).item.label, 'J10')
})

test('jumper-style labels with no BOM reference are reported, not proposed', () => {
  const words = [word('R58', 100, 100), word('J58', 200, 100), word('J18', 300, 200), word('J58', 400, 300), word('J10', 500, 400)]
  const result = detectBomComponents(words, resistors, [])
  assert.deepEqual(
    result.detections.map((entry) => entry.label),
    ['R58'],
  )
  assert.deepEqual(result.untyped, ['J10'])
  assert.deepEqual(result.jumpers, ['J18', 'J58'])
})

test('a misread prefix must be a letter OCR really confuses, and digit-only text is no reference', () => {
  assert.equal(matchReference('A35', resistors)?.item.label, 'R35')
  assert.equal(matchReference('M35', resistors), null)
  assert.equal(matchReference('.022', resistors), null)
  assert.equal(matchReference('K58', resistors)?.item.label, 'R58')
  assert.equal(matchReference('PR58', resistors)?.item.label, 'R58')
  assert.equal(matchReference('LCR2', resistors)?.item.label, 'CR2')
  assert.equal(matchReference('VA7', resistors)?.item.label, 'VR7')
  assert.equal(matchReference('R5S', [item('R55')])?.item.label, 'R55')
})

test('the manual label search stays permissive', async () => {
  const { labelCandidates } = await import('./bom.js')
  assert.deepEqual(
    labelCandidates('J58', resistors).map((entry) => entry.label),
    ['R58'],
  )
  assert.deepEqual(labelCandidates('J58', resistors, { strict: true }), [])
})

test('the subtype a parts list names in its wording refines the type found by the prefix', () => {
  const typeOf = (label, description, value = '') => inferBomType(item(label, { description, value }))
  assert.equal(typeOf('C38', '22 MFD 450 VDC LYTIC CAP'), 'electrolytic-capacitor')
  assert.equal(typeOf('C5', '22 MFD 25VDC LYT. CAP. T&R'), 'electrolytic-capacitor')
  assert.equal(typeOf('C40', '47MF —10%-500VDC-EL-AX'), 'electrolytic-capacitor')
  assert.equal(typeOf('C43', '2200 MFD/35V RAD PC MOUNT'), 'electrolytic-capacitor')
  assert.equal(typeOf('C36', '.01MFD 1000VDC CD-UNCUT', '.01CER'), 'ceramic-capacitor')
  assert.equal(typeOf('C18', '470PF 10% 50V TUB CER T&R'), 'ceramic-capacitor')
  assert.equal(typeOf('C12', '.22 MFD 100VDC 5% MYLAR'), 'film-capacitor')
  assert.equal(typeOf('C11', '.047 MFD 400 V T&R CAP'), 'capacitor')
  assert.equal(typeOf('R57', '700—15W—10%—WW—AXL'), 'wirewound-resistor')
  assert.equal(typeOf('R61', '22 1/4W—5% CF—T&R'), 'resistor')
  assert.equal(typeOf('CR8', '1N4007 1KV,1A SIL. DIODE'), 'rectifier-diode')
  assert.equal(typeOf('CR2', '1N757A 9.1V 5% ZENER T&R'), 'zener-diode')
  assert.equal(typeOf('CR1', '1N4148 75V 10MA SILICON DIODE'), 'diode')
})

test('a subtype learned from one part does not spread to every part with its prefix', () => {
  const model = learnReferenceModel([
    createAssignment({ reference: 'C37', type: 'electrolytic-capacitor', text: 'CC37' }),
    createAssignment({ reference: 'CR12', type: 'rectifier-diode', text: 'CA12' }),
    createAssignment({ reference: 'VR2', type: 'potentiometer' }),
  ])
  const typeOf = (label, description) => inferBomType(item(label, { description }), model)
  assert.equal(typeOf('C11', '.047 MFD 400 V T&R CAP'), 'capacitor')
  assert.equal(typeOf('C38', '22 MFD 450 VDC LYTIC CAP'), 'electrolytic-capacitor')
  assert.equal(typeOf('CR5', 'SR-2873 2KV,250MA SIL DIO'), 'diode')
  assert.equal(typeOf('VR5', '1MEG AUD VPC 5% TAPER'), 'potentiometer')
})
