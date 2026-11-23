import assert from 'node:assert/strict'
import test from 'node:test'
import { parseValue, valueKindOf, valueNear } from './componentValues.js'

test('resistances are read from the notations used on schematics', () => {
  const read = (text) => parseValue(text, 'resistance')
  assert.equal(read('47K'), '47 kΩ')
  assert.equal(read('1k5'), '1.5 kΩ')
  assert.equal(read('4R7'), '4.7 Ω')
  assert.equal(read('100R'), '100 Ω')
  assert.equal(read('1M'), '1 MΩ')
  assert.equal(read('1.0M'), '1 MΩ')
  assert.equal(read('250kA'), '250 kΩ')
  assert.equal(read('2.2K'), '2.2 kΩ')
  assert.equal(read('16 ohm'), '16 Ω')
  assert.equal(read('22K3'), null)
  assert.equal(read('1k5'), '1.5 kΩ')
  assert.equal(read('500K'), '500 kΩ')
})

test('scanned digits misread as letters are repaired only in value-shaped text', () => {
  const read = (text) => parseValue(text, 'resistance')
  assert.equal(read('IOOK'), '100 kΩ')
  assert.equal(read('10OK'), '100 kΩ')
  assert.equal(read('IM'), '1 MΩ')
  assert.equal(read('OK'), null)
  assert.equal(read('IN34A'), null)
})

test('capacitances are read in microfarads, nanofarads and picofarads', () => {
  const read = (text) => parseValue(text, 'capacitance')
  assert.equal(read('0.01uF'), '0.01 µF')
  assert.equal(read('.01uF'), '0.01 µF')
  assert.equal(read('250uF'), '250 µF')
  assert.equal(read('220pF'), '220 pF')
  assert.equal(read('220 μμ'), '220 pF')
  assert.equal(read('220 µµ'), '220 pF')
  assert.equal(read('.02'), '0.02 µF')
  assert.equal(read('.0005'), '0.0005 µF')
  assert.equal(read('20/450'), '20 µF')
  assert.equal(read('47K'), null)
})

test('values that do not match the component kind are ignored', () => {
  assert.equal(parseValue('47K', 'capacitance'), null)
  assert.equal(parseValue('0.02', 'resistance'), null)
  assert.equal(parseValue('3A', 'resistance'), null)
  assert.equal(parseValue('EL84', 'resistance'), null)
  assert.equal(parseValue('47K', null), null)
})

test('only resistors and capacitors have a readable value kind', () => {
  assert.equal(valueKindOf('resistor'), 'resistance')
  assert.equal(valueKindOf('potentiometer'), 'resistance')
  assert.equal(valueKindOf('electrolytic-capacitor'), 'capacitance')
  assert.equal(valueKindOf('el84'), null)
})

test('the nearest suitable text beside a symbol gives its value', () => {
  const words = [
    { text: '1M', x: 400, y: 100, width: 20, height: 12 },
    { text: '47K', x: 130, y: 100, width: 24, height: 12 },
    { text: '.02', x: 118, y: 140, width: 20, height: 12 },
  ]
  const box = [100, 100, 124, 130]
  assert.equal(valueNear(box, 'resistor', words), '47 kΩ')
  assert.equal(valueNear(box, 'capacitor', words), '0.02 µF')
  assert.equal(valueNear([700, 700, 724, 730], 'resistor', words), '')
  assert.equal(valueNear(box, 'el84', words), '')
})
