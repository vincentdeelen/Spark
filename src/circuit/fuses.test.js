import test from 'node:test'
import assert from 'node:assert/strict'
import { componentFamilies, findLibraryItem } from './library.js'
import { formatComponentValue, normalizeFuseSpeed, ratingFields } from './ratings.js'
import { componentFromBom, generateBom, parseCsv, rowsToBom, bomToCsv, validateBom } from '../bom/bom.js'
import { inferBomType } from '../bom/bomDetection.js'
import { createComponent } from './diagramOps.js'
import { readSparkMetadata } from '../project/circuitFile.js'
import { isTwoTerminal } from './partGeometry.js'

const fuse = (extra = {}) => ({ id: 'f', type: 'glass-fuse', x: 100, y: 100, rotation: 0, label: 'F1', value: '2 A', ...extra })
const metadata = (components) => JSON.stringify({ format: 'spark-circuit', version: 1, diagram: { components, wires: [] } })
const circuits = (components) => [{ id: 'a', name: 'Amp', diagram: { components } }]

test('fuses form their own toolbox category with per-type characteristics', () => {
  const types = componentFamilies.find((family) => family.id === 'fuse').subtypes.map((item) => item.type)
  assert.deepEqual(types, ['fuse', 'glass-fuse', 'ceramic-fuse', 'blade-fuse', 'resettable-fuse', 'thermal-fuse'])
  assert.deepEqual(ratingFields('glass-fuse'), ['voltage', 'size', 'speed'])
  assert.deepEqual(ratingFields('blade-fuse'), ['voltage', 'size'])
  assert.deepEqual(ratingFields('resistor'), ['wattage', 'tolerance', 'voltage'])
  assert.deepEqual(ratingFields('electrolytic-capacitor'), ['voltage', 'tolerance'])
  assert.deepEqual(ratingFields('capacitor'), ['voltage', 'tolerance'])
  assert.deepEqual(ratingFields('inductor'), [])
  assert.equal(isTwoTerminal(fuse({ type: 'thermal-fuse' })), true)
})

test('fuse characteristics are shown next to the current limit with units and blow wording', () => {
  assert.equal(formatComponentValue(fuse({ voltage: '250', size: '5×20 mm', speed: 'slow' })), '2 A · 250 V · 5×20 mm · slow blow')
  assert.equal(formatComponentValue(fuse({ voltage: '32 v' })), '2 A · 32 v')
  assert.equal(formatComponentValue(fuse()), '2 A')
  assert.equal(formatComponentValue({ type: 'resistor', value: '1 kΩ', wattage: '0.25', tolerance: '5' }), '1 kΩ · 0.25 W · ±5%')
})

test('blow characteristics are recognised from stored values, IEC codes and wording', () => {
  for (const [text, expected] of [
    ['slow', 'slow'],
    ['T', 'slow'],
    ['Slow blow', 'slow'],
    ['time-delay', 'slow'],
    ['FF', 'very-fast'],
    ['Fast blow (F)', 'fast'],
    ['M', 'medium'],
    ['TT', 'very-slow'],
    ['', ''],
    ['mystery', ''],
  ]) {
    assert.equal(normalizeFuseSpeed(text), expected, text)
  }
})

test('new fuses start with the typical characteristics of their type', () => {
  const glass = createComponent(findLibraryItem('glass-fuse'), [], { x: 0, y: 0 })
  assert.deepEqual([glass.label, glass.value, glass.voltage, glass.size, glass.speed], ['F1', '1 A', '250', '5×20 mm', 'fast'])
  const resistor = createComponent(findLibraryItem('resistor'), [], { x: 0, y: 0 })
  assert.equal('size' in resistor, false)
})

test('fuse characteristics survive Spark metadata and reject ratings the type does not have', () => {
  const component = fuse({ voltage: '250', size: '5×20 mm', speed: 'slow' })
  assert.deepEqual(readSparkMetadata(metadata([component])).components[0], component)
  assert.throws(() => readSparkMetadata(metadata([fuse({ wattage: '1' })])), /invalid component/)
  assert.throws(() => readSparkMetadata(metadata([fuse({ speed: 'instant' })])), /invalid component/)
  assert.throws(() => readSparkMetadata(metadata([fuse({ type: 'blade-fuse', speed: 'fast' })])), /invalid component/)
  assert.throws(() => readSparkMetadata(metadata([{ ...fuse(), type: 'resistor', size: '5×20 mm' }])), /invalid component/)
})

test('BOMs carry fuse characteristics in their own columns and apply them to components', () => {
  const components = [fuse({ voltage: '250', size: '5×20 mm', speed: 'slow' }), { id: 'r', type: 'resistor', x: 0, y: 0, rotation: 0, label: 'R1', value: '1k' }]
  const bom = generateBom(circuits(components))
  assert.deepEqual([bom[0].voltage, bom[0].size, bom[0].speed], ['250', '5×20 mm', 'slow'])
  assert.equal('size' in bom[1], false)
  const csv = bomToCsv(bom, circuits(components))
  assert.match(csv.split('\r\n')[0], /"Value","Voltage","Wattage","Tolerance","Description","Size","Speed"/)
  assert.deepEqual(rowsToBom(parseCsv(csv), circuits(components), ''), bom)
  const imported = rowsToBom(parseCsv('Reference,Type,Value,Speed,Dimensions,Rated voltage\nF1,glass-fuse,3 A,Slow blow,6.3×32 mm,250'), circuits(components), 'a')[0]
  assert.deepEqual([imported.speed, imported.size, imported.voltage], ['slow', '6.3×32 mm', '250'])
  assert.deepEqual(componentFromBom(fuse({ speed: 'fast' }), imported), fuse({ value: '3 A', voltage: '250', size: '6.3×32 mm', speed: 'slow' }))
  assert.deepEqual(componentFromBom(fuse({ voltage: '250' }), { type: 'resistor', value: '1k', wattage: '', tolerance: '' }), {
    ...fuse({ type: 'resistor', value: '1k', voltage: '250' }),
  })
  assert.deepEqual(validateBom(bom, new Set(['a']))[0].size, '5×20 mm')
  assert.throws(() => validateBom([{ ...bom[0], size: 5 }], new Set(['a'])), /Invalid/)
})

test('BOM wording picks the matching fuse subtype', () => {
  const item = (label, extra) => ({ label, type: '', value: '', description: '', ...extra })
  assert.equal(inferBomType(item('F1', { description: 'FUSE, AGC 3 AMP' })), 'glass-fuse')
  assert.equal(inferBomType(item('F2', { description: 'Resettable PTC 500mA' })), 'resettable-fuse')
  assert.equal(inferBomType(item('F3', { description: 'ATO blade 10A' })), 'blade-fuse')
  assert.equal(inferBomType(item('F4', { description: 'Thermal cutoff' })), 'thermal-fuse')
  assert.equal(inferBomType(item('F5', { value: '1 A' })), 'fuse')
  assert.equal(inferBomType(item('F6', { type: 'ceramic-fuse' })), 'ceramic-fuse')
})
