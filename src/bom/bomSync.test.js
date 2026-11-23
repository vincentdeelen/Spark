import test from 'node:test'
import assert from 'node:assert/strict'
import { bomToRows, componentFromBom, generateBom, isBuiltInColumn, validateBom } from './bom.js'
import { addMissingToBom, bomGaps, duplicateReferences, planUniqueReferences, updateBomItem, withRenames, withoutBomItems } from './bomSync.js'

const part = (id, type, label, value = '') => ({ id, type, label, value, x: 0, y: 0, rotation: 0 })
// The Pre Amp circuit has two parts called C1 and no C5.
const preamp = () => ({
  id: 'doc',
  name: 'Pre Amp',
  diagram: {
    components: [
      part('c1a', 'electrolytic-capacitor', 'C1', '10 µF'),
      part('c1b', 'capacitor', 'c1', '100 nF'),
      part('c2', 'capacitor', 'C2', '100 nF'),
      part('c3', 'capacitor', 'C3', '100 nF'),
      part('c4', 'capacitor', 'C4', '100 nF'),
      part('c6', 'electrolytic-capacitor', 'C6', '10 µF'),
      part('g1', 'ground', 'GND'),
      part('g2', 'ground', 'GND'),
    ],
    wires: [],
  },
})

test('two parts with one reference stop a BOM from being generated, grounds sharing GND do not', () => {
  assert.throws(() => generateBom([preamp()]), /Duplicate/)
  assert.deepEqual(
    duplicateReferences([preamp()]).map((item) => [item.label, item.components.map((component) => component.id)]),
    [['C1', ['c1a', 'c1b']]],
  )
})

test('the second of two equal references takes the first free one, and the circuit can then be listed', () => {
  const { renames, unresolved } = planUniqueReferences([preamp()])
  assert.deepEqual(unresolved, [])
  assert.deepEqual(
    renames.map((item) => [item.id, item.from, item.to]),
    [['c1b', 'c1', 'C5']],
  )
  const fixed = withRenames([preamp()], renames)
  assert.equal(generateBom(fixed).length, 6)
  assert.equal(preamp().diagram.components[1].label, 'c1', 'the original is untouched')
})

test('several duplicates get different new references, and triode sections are not renamed', () => {
  const circuit = {
    id: 'd',
    name: 'C',
    diagram: { components: [part('a', 'resistor', 'R1'), part('b', 'resistor', 'R1'), part('c', 'resistor', 'R1'), part('v', 'resistor', 'R2')], wires: [] },
  }
  assert.deepEqual(
    planUniqueReferences([circuit]).renames.map((item) => item.to),
    ['R3', 'R4'],
  )
  const sections = { id: 'e', name: 'S', diagram: { components: [part('a', '12ax7-triode', 'V1A'), part('b', '12ax7-triode', 'V1A')], wires: [] } }
  assert.equal(planUniqueReferences([sections]).unresolved.length, 1)
})

test('generating again keeps what the BOM knows about a part and the added gaps are found', () => {
  const circuit = withRenames([preamp()], planUniqueReferences([preamp()]).renames)[0]
  const first = generateBom([circuit])
  const edited = updateBomItem(first, 'doc', 'C2', { description: 'film, 63 V', specifications: { Maker: 'WIMA' } })
  const again = generateBom([circuit], edited)
  assert.equal(again.find((item) => item.label === 'C2').description, 'film, 63 V')
  assert.deepEqual(again.find((item) => item.label === 'C2').specifications, { Maker: 'WIMA' })
  const withoutC6 = edited.filter((item) => item.label !== 'C6')
  assert.deepEqual(bomGaps([circuit], withoutC6).missing, [{ circuitId: 'doc', label: 'C6' }])
  assert.equal(addMissingToBom([circuit], withoutC6).length, edited.length)
  assert.equal(addMissingToBom([circuit], withoutC6).find((item) => item.label === 'C2').description, 'film, 63 V')
  assert.equal(bomGaps([circuit], [...edited, { ...edited[0], label: 'C99' }]).orphans.length, 1)
})

test('capacitors and resistors carry a voltage rating, capacitors a tolerance, and the BOM lists the voltage right after the value', () => {
  const circuit = {
    id: 'doc',
    name: 'Amp',
    diagram: {
      components: [
        { ...part('c', 'electrolytic-capacitor', 'C1', '10 µF'), voltage: '450', tolerance: '20' },
        { ...part('r', 'resistor', 'R1', '100 kΩ'), voltage: '250', wattage: '0.5' },
      ],
      wires: [],
    },
  }
  const bom = generateBom([circuit])
  assert.deepEqual(
    bom.map((item) => [item.label, item.voltage, item.tolerance]),
    [
      ['C1', '450', '20'],
      ['R1', '250', ''],
    ],
  )
  assert.deepEqual(bomToRows(bom, [circuit])[0].slice(0, 8), ['Circuit', 'Reference', 'Type', 'Value', 'Voltage', 'Wattage', 'Tolerance', 'Description'])
  const applied = componentFromBom(circuit.diagram.components[0], { ...bom[0], voltage: '63', tolerance: '10' })
  assert.deepEqual([applied.voltage, applied.tolerance], ['63', '10'])
  assert.equal(componentFromBom(circuit.diagram.components[0], { ...bom[0], wattage: '1' }).wattage, undefined, 'no wattage on a capacitor')
})

test('rows that no component has can be removed from the BOM', () => {
  const [full] = withRenames([preamp()], planUniqueReferences([preamp()]).renames)
  const circuit = { ...full, diagram: { ...full.diagram, components: full.diagram.components.slice(1) } }
  const bom = [...generateBom([circuit]), { ...generateBom([full])[0], label: 'C99' }]
  const { orphans } = bomGaps([circuit], bom)
  assert.deepEqual(
    orphans.map((item) => item.label),
    ['C99'],
  )
  assert.equal(withoutBomItems(bom, orphans).length, bom.length - 1)
  assert.ok(withoutBomItems(bom, orphans).every((item) => item.label !== 'C99'))
})

test('a hand-made column named like a built-in one is folded into it, and a rating only the BOM knows survives generating', () => {
  const circuit = { id: 'doc', name: 'Amp', diagram: { components: [part('c', 'electrolytic-capacitor', 'C9', '10 µF')], wires: [] } }
  const [row] = generateBom([circuit])
  const loaded = validateBom([{ ...row, specifications: { Voltage: '25', Maker: 'Nichicon' } }], new Set(['doc']))[0]
  assert.equal(loaded.voltage, '25')
  assert.deepEqual(loaded.specifications, { Maker: 'Nichicon' })
  assert.equal(generateBom([circuit], [loaded])[0].voltage, '25')
  assert.ok(isBuiltInColumn(' voltage ') && isBuiltInColumn('Tolerance') && !isBuiltInColumn('Maker'))
})
