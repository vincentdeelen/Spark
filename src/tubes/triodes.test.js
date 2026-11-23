import test from 'node:test'
import assert from 'node:assert/strict'
import { dualTriodeOf, splitSectionLabel, typeForBom } from './triodes.js'
import { findLibraryItem } from '../circuit/library.js'
import { formatComponentValue, ratingFields } from '../circuit/ratings.js'
import { symbolViewBox } from '../components/symbols/symbolViewBox.js'
import { assertUniqueMatchedReferences, componentFromBom, generateBom, historyBomUpdates, matchBom } from '../bom/bom.js'
import { detectBomComponents, inferBomType, matchReference } from '../bom/bomDetection.js'
import { createComponent } from '../circuit/diagramOps.js'
import { readSparkMetadata } from '../project/circuitFile.js'
import { createAssignment, learnReferenceModel } from '../importing/referenceLearning.js'

const item = (label, extra = {}) => ({ documentId: 'a', label, type: '', value: '', wattage: '', tolerance: '', description: '', specifications: {}, ...extra })
const word = (text, x, y) => ({ text, x, y, width: 24, height: 10, confidence: 90 })
const section = (label, extra = {}) => ({ id: label, type: '12ax7-triode', x: 0, y: 0, rotation: 0, label, value: '12AX7', section: label.endsWith('B') ? 'B' : 'A', ...extra })

const bom = [item('V2', { value: '12AX7' }), item('V3', { type: '12at7' }), item('V4', { value: 'EL84' }), item('R1', { type: 'resistor' })]

test('section labels split into the tube reference and the section letter', () => {
  assert.deepEqual(splitSectionLabel('v2a'), { base: 'V2', section: 'A' })
  assert.deepEqual(splitSectionLabel('V12B'), { base: 'V12', section: 'B' })
  assert.equal(splitSectionLabel('V2'), null)
  assert.equal(splitSectionLabel('R1C'), null)
  assert.equal(dualTriodeOf(item('V2', { description: '12AX7 / ECC83' })), '12ax7')
  assert.equal(dualTriodeOf(item('V4', { value: 'EL84' })), '')
})

test('triode sections are tube components carrying only the section rating', () => {
  assert.deepEqual(ratingFields('12au7-triode'), ['section'])
  assert.equal(findLibraryItem('12ax7-triode').category, 'TUBES')
  assert.equal(formatComponentValue(section('V2A')), '12AX7')
  assert.equal(symbolViewBox('12ax7-triode'), '-52 -48 124 104')
})

test('a section type is kept when the BOM names the whole tube, but any other BOM type wins', () => {
  assert.equal(typeForBom('12ax7', '12ax7-triode'), '12ax7-triode')
  assert.equal(typeForBom('12at7', '12ax7-triode'), '12at7')
  assert.equal(typeForBom('', 'resistor'), 'resistor')
  const component = componentFromBom(section('V2B'), item('V2', { value: '12AX7 (ECC83)', type: '12ax7' }))
  assert.deepEqual([component.type, component.section, component.value], ['12ax7-triode', 'B', '12AX7 (ECC83)'])
  const history = historyBomUpdates({ components: [section('V2A', { x: 1 })] }, { components: [section('V2A')] }, [item('V2', { type: '12ax7' })], 'a')
  assert.deepEqual(history, [])
})

test('both sections of a tube match its one BOM row and need their own labels', () => {
  assert.equal(matchBom(bom, 'a', 'V2A'), bom[0])
  assert.equal(matchBom(bom, 'a', 'v2b'), bom[0])
  assert.equal(matchBom(bom, 'a', 'V4A'), undefined)
  const circuit = { id: 'a', name: 'Amp', diagram: { components: [section('V2A'), section('V2B')] } }
  assertUniqueMatchedReferences([circuit], bom)
  const twice = { ...circuit, diagram: { components: [section('V2A'), section('V2A', { id: 'x' })] } }
  assert.throws(() => assertUniqueMatchedReferences([twice], bom), /multiple components labelled V2A/)
})

test('a generated BOM lists a dual triode once, whichever sections are drawn', () => {
  const circuits = [{ id: 'a', name: 'Amp', diagram: { components: [section('V2A'), section('V2B'), section('V1A'), { ...section('V4'), type: 'el84', value: 'EL84' }] } }]
  assert.deepEqual(
    generateBom(circuits).map((row) => [row.label, row.type, row.value]),
    [
      ['V2', '12ax7', '12AX7'],
      ['V1', '12ax7', '12AX7'],
      ['V4', 'el84', 'EL84'],
    ],
  )
})

test('new sections follow the letter in their label', () => {
  const library = findLibraryItem('12ax7-triode')
  assert.equal(createComponent(library, [], { x: 0, y: 0, label: 'V2B' }).section, 'B')
  assert.equal(createComponent(library, [], { x: 0, y: 0 }).section, 'A')
})

test('BOM references find triode sections, and sections get their own proposals', () => {
  assert.deepEqual(matchReference('V2A', bom), { item: bom[0], exact: true, learned: false, section: 'A' })
  assert.equal(matchReference('V9B', bom), null)
  assert.equal(inferBomType(item('V2A', { value: '12AX7' })), '12ax7-triode')
  assert.equal(inferBomType(bom[0]), '12ax7')

  const words = [word('V2A', 100, 100), word('V2B', 100, 200), word('V3B', 300, 100), word('V4', 300, 200), word('V5A', 5, 5)]
  const result = detectBomComponents(words, bom, [{ label: 'v2a' }])
  assert.deepEqual(
    result.detections.map((entry) => [entry.label, entry.reference, entry.type, entry.section]),
    [
      ['V2B', 'V2', '12ax7-triode', 'B'],
      ['V3B', 'V3', '12at7-triode', 'B'],
      ['V4', 'V4', 'el84', undefined],
    ],
  )
  assert.equal(result.missing, 1)
  assert.equal(detectBomComponents([], bom, []).missing, 4)
  assert.equal(detectBomComponents([], bom, [{ label: 'V2B' }]).missing, 3)
})

test('learning from tubes does not override the tube a BOM names', () => {
  const model = learnReferenceModel([createAssignment({ reference: 'V2', type: '12ax7-triode' }), createAssignment({ reference: 'V4', type: 'el84' })])
  assert.equal(model.prefixTypes.V, undefined)
  assert.equal(inferBomType(item('V5', { value: 'EL84' }), model), 'el84')
})

test('imported circuits accept sections A and B only', () => {
  const metadata = (extra) => JSON.stringify({ format: 'spark-circuit', version: 1, diagram: { components: [{ ...section('V2A'), ...extra }], wires: [] } })
  assert.equal(readSparkMetadata(metadata({ section: 'B' })).components[0].section, 'B')
  assert.throws(() => readSparkMetadata(metadata({ section: 'C' })), /invalid component/)
})
