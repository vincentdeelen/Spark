import assert from 'node:assert/strict'
import test from 'node:test'
import { formatQuantity, parseQuantity, parseWattage } from './siValue.js'

test('reads values as written on the canvas', () => {
  assert.equal(parseQuantity('1 kΩ', 'Ω'), 1000)
  assert.equal(parseQuantity('150 kΩ', 'Ω'), 150000)
  assert.equal(parseQuantity('1MΩ', 'Ω'), 1e6)
  assert.equal(parseQuantity('1 M', 'Ω'), 1e6)
  assert.equal(parseQuantity('2.2k', 'Ω'), 2200)
  assert.equal(parseQuantity('47', 'Ω'), 47)
  assert.equal(parseQuantity('4R7', 'Ω'), 4.7)
  assert.equal(parseQuantity('1k5', 'Ω'), 1500)
  assert.equal(parseQuantity('10 mΩ', 'Ω'), 0.01)
  assert.equal(parseQuantity('47 nF', 'F'), 47e-9)
  assert.equal(parseQuantity('10 µF', 'F'), 10e-6)
  assert.equal(parseQuantity('100pF', 'F'), 100e-12)
  assert.equal(parseQuantity('10 µH', 'H'), 10e-6)
  assert.equal(parseQuantity('5 V', 'V'), 5)
  assert.equal(parseQuantity('250V', 'V'), 250)
  assert.equal(parseQuantity('500 mA', 'A'), 0.5)
  assert.equal(parseQuantity('1 A', 'A'), 1)
  assert.equal(parseQuantity('10–100 pF', 'F'), 10e-12)
})

test('rejects text that is not a quantity of that unit', () => {
  assert.equal(parseQuantity('NTC', 'Ω'), null)
  assert.equal(parseQuantity('LED', 'V'), null)
  assert.equal(parseQuantity('', 'Ω'), null)
  assert.equal(parseQuantity('abc', 'F'), null)
  assert.equal(parseQuantity('5 V', 'A'), null)
  assert.equal(parseQuantity('1 kΩ', 'F'), null)
})

test('reads power ratings as fractions, watts or milliwatts', () => {
  assert.equal(parseWattage('1/4'), 0.25)
  assert.equal(parseWattage('1/2 W'), 0.5)
  assert.equal(parseWattage('0.5'), 0.5)
  assert.equal(parseWattage('250 mW'), 0.25)
  assert.equal(parseWattage('2W'), 2)
  assert.equal(parseWattage('lots'), null)
})

test('formats results with an SI prefix', () => {
  assert.equal(formatQuantity(0.003138, 'A'), '3.14 mA')
  assert.equal(formatQuantity(1.8615, 'V'), '1.86 V')
  assert.equal(formatQuantity(47e-9, 'F'), '47 nF')
  assert.equal(formatQuantity(250, 'V'), '250 V')
  assert.equal(formatQuantity(1500, 'Ω'), '1.5 kΩ')
  assert.equal(formatQuantity(-0.0021, 'A'), '-2.1 mA')
  assert.equal(formatQuantity(0, 'A'), '0 A')
  assert.equal(formatQuantity(1e-16, 'A'), '0 A')
  assert.equal(formatQuantity(NaN, 'V'), '—')
})
