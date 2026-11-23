import assert from 'node:assert/strict'
import test from 'node:test'
import { detailedTubeTypes } from './triodes.js'
import { TUBE_SPECS, tubeSpecsFor } from './tubeData.js'

const component = (type, value = '') => ({ id: 'x', type, label: 'V1', value })

test('every detailed tube type has characteristics, starting with the amplification factor', () => {
  for (const type of detailedTubeTypes) {
    assert.ok(TUBE_SPECS[type], type)
    assert.match(TUBE_SPECS[type].rows[0][0], /Amplification factor/)
    assert.ok(TUBE_SPECS[type].rows.some(([name]) => /Max plate dissipation/.test(name)))
  }
})

test('the 12AX7 lists the characteristics of the data sheet', () => {
  const specs = tubeSpecsFor(component('12ax7', '12AX7'))
  const row = (name) => specs.rows.find(([label]) => label.startsWith(name))?.[1]
  assert.equal(row('Amplification factor'), '100 (high voltage gain)')
  assert.match(row('Plate resistance'), /^62\.5 kΩ at 250 V/)
  assert.match(row('Transconductance'), /1,600 μmhos/)
  assert.match(row('Max plate dissipation'), /1\.0 W to 1\.2 W per section/)
  assert.ok(specs.equivalents.includes('ECC83'))
})

test('a triode section shows its whole tube, and the generic tube follows the type its value names', () => {
  const section = tubeSpecsFor(component('12at7-triode', '12AT7'))
  assert.equal(section.type, '12at7')
  assert.equal(section.section, true)
  assert.equal(tubeSpecsFor(component('tube', 'ECC82')).type, '12au7')
  assert.equal(tubeSpecsFor(component('tube', 'Triode')), null)
  assert.equal(tubeSpecsFor(component('resistor', '12AX7')), null)
})
