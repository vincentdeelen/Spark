import assert from 'node:assert/strict'
import test from 'node:test'
import { findLibraryItem, equivalentNames, library, searchTextOf } from '../circuit/library.js'
import { dualTriodeOf } from './triodes.js'
import { inferBomType } from '../bom/bomDetection.js'
import { matchBom, rowsToBom } from '../bom/bom.js'
import { mentionsTube, tubeTypeFromText } from './tubeNames.js'

const item = (label, extra = {}) => ({ documentId: 'a', label, type: '', value: '', wattage: '', tolerance: '', description: '', specifications: {}, ...extra })

test('equivalent tube names resolve to the toolbox tube type', () => {
  const read = tubeTypeFromText
  assert.equal(read('ECC83'), '12ax7')
  assert.equal(read('ecc-83 / 7025'), '12ax7')
  assert.equal(read('12AX7A'), '12ax7')
  assert.equal(read('ECC81'), '12at7')
  assert.equal(read('6201'), '12at7')
  assert.equal(read('ECC82'), '12au7')
  assert.equal(read('5814A'), '12au7')
  assert.equal(read('EL-84'), 'el84')
  assert.equal(read('6BQ5'), 'el84')
  assert.equal(read('5881'), '6l6gc')
  assert.equal(read('6L6WGC'), '6l6gc')
  assert.equal(read('ECC83S matched pair'), '12ax7')
})

test('names inside other parts are not mistaken for tubes', () => {
  assert.equal(tubeTypeFromText('0.6201uF'), '')
  assert.equal(tubeTypeFromText('100K 5881 ohm'), '6l6gc')
  assert.equal(tubeTypeFromText('EL844'), '')
  assert.equal(tubeTypeFromText('1N4007'), '')
  assert.equal(tubeTypeFromText(''), '')
})

test('tube and valve mean the same', () => {
  assert.equal(mentionsTube('Power valve'), true)
  assert.equal(mentionsTube('Preamp TUBE'), true)
  assert.equal(mentionsTube('Capacitor'), false)
  assert.equal(inferBomType(item('V9', { description: 'Rectifier valve' })), 'tube')
  assert.equal(inferBomType(item('V1', { value: 'ECC83' })), '12ax7')
  assert.equal(inferBomType(item('V3', { description: '6BQ5 valve' })), 'el84')
})

test('a BOM that names the tube by an equivalent name still matches its triode sections', () => {
  assert.equal(dualTriodeOf(item('V2', { value: 'ECC83' })), '12ax7')
  assert.equal(dualTriodeOf(item('V2', { value: 'ECC81' })), '12at7')
  assert.equal(dualTriodeOf(item('V4', { value: '6BQ5' })), '')
  assert.equal(matchBom([item('V2', { value: 'ECC83' })], 'a', 'V2B')?.label, 'V2')
  assert.equal(inferBomType(item('V2B', { value: 'ECC83' }), undefined), '12ax7-triode')
})

test('a BOM type cell can say valve or use an equivalent tube name', () => {
  const rows = (type) =>
    rowsToBom(
      [
        ['Reference', 'Type', 'Value'],
        ['V1', type, 'x'],
      ],
      [{ id: 'a', name: 'A' }],
      'a',
    )
  assert.equal(rows('Valve')[0].type, 'tube')
  assert.equal(rows('ECC83')[0].type, '12ax7')
  assert.equal(rows('12AX7 tube')[0].type, '12ax7')
  assert.throws(() => rows('flux capacitor'), /unknown component type/)
})

test('the toolbox search finds tubes by valve and by equivalent names', () => {
  const found = (term) => library.filter((entry) => searchTextOf(entry).toLowerCase().includes(term)).map((entry) => entry.type)
  assert.ok(found('valve').includes('12ax7'))
  assert.ok(found('ecc83').includes('12ax7'))
  assert.ok(found('ecc83').includes('12ax7-triode'))
  assert.ok(!found('ecc83').includes('12at7'))
  assert.deepEqual(equivalentNames(findLibraryItem('resistor')), [])
})
