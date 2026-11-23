import assert from 'node:assert/strict'
import test from 'node:test'
import { bomToRows, generateBom, inferComponentType, rowsToBom } from '../bom/bom.js'
import { readSparkMetadata } from '../project/circuitFile.js'
import { testCircuit } from '../simulation/circuitTest.js'
import { buildNetlist } from '../simulation/spiceNetlist.js'
import { runSpice } from '../simulation/spiceRun.js'
import { changeSubtype, createComponent } from './diagramOps.js'
import { componentFamilies, findLibraryItem } from './library.js'
import { terminalsOf } from './partGeometry.js'
import { formatComponentValue, ratingFields } from './ratings.js'
import { nextReference } from './references.js'
import { TRANSFORMER_TYPES, transformerSpecs, transformerWindings } from './transformers.js'

let counter = 0
const part = (type, x, y, rotation, label, value, extra = {}) => ({ id: `c${(counter += 1)}`, type, x, y, rotation, label, value, ...extra })
const wire = (...points) => ({ id: `w${(counter += 1)}`, points })
const output = (extra = {}) => part('output-transformer', 300, 200, 0, 'OT1', '4.2 kΩ : 8 Ω', extra)
const run = (diagram) => testCircuit(diagram, { title: 'test', simulate: runSpice })
const messages = (report, severity) => report.findings.filter((item) => item.severity === severity).map((item) => item.message)

test('the transformer kinds are one family with their own references and characteristics', () => {
  assert.ok(TRANSFORMER_TYPES.every((type) => findLibraryItem(type).category === 'TRANSFORMERS'))
  const family = componentFamilies.find((item) => item.id === 'transformer')
  assert.deepEqual(
    family.subtypes.map((item) => item.type),
    TRANSFORMER_TYPES,
  )
  const next = (type) => nextReference(findLibraryItem(type), [])
  assert.deepEqual([next('power-transformer'), next('output-transformer'), next('transformer')], ['PT1', 'OT1', 'T1'])
  assert.deepEqual(ratingFields('output-transformer'), ['primaryImpedance', 'secondaryImpedance', 'wattage', 'primaryDcr', 'secondaryDcr'])
  assert.ok(ratingFields('power-transformer').includes('primaryVoltage'))
  assert.ok(!ratingFields('output-transformer').includes('primaryVoltage'))
  assert.equal(inferComponentType('OT1'), 'output-transformer')
  assert.equal(inferComponentType('PT2'), 'power-transformer')
  assert.equal(inferComponentType('T1'), 'transformer')
})

test('a new transformer carries sample characteristics and shows them with its value', () => {
  const placed = createComponent(findLibraryItem('output-transformer'), [], { x: 100, y: 100 })
  assert.deepEqual([placed.label, placed.primaryImpedance, placed.secondaryImpedance], ['OT1', '4.2 kΩ', '8 Ω'])
  assert.equal(formatComponentValue({ ...placed, wattage: '50', primaryDcr: '150' }), '4.2 kΩ : 8 Ω · 4.2 kΩ · 8 Ω · 50 W · 150 Ω')
})

test('switching kind keeps the characteristics both kinds have and drops the others', () => {
  const power = createComponent(findLibraryItem('power-transformer'), [], { x: 0, y: 0 })
  const rated = { ...power, wattage: '100', primaryDcr: '3' }
  const switched = changeSubtype(rated, 'output-transformer')
  assert.equal(switched.type, 'output-transformer')
  assert.deepEqual([switched.wattage, switched.primaryDcr, switched.primaryImpedance, switched.secondaryImpedance], ['100', '3', '4.2 kΩ', '8 Ω'])
  for (const field of ['primaryVoltage', 'secondaryVoltage', 'frequency']) assert.equal(field in switched, false, field)
})

test('what follows from the entered values is worked out, and only when it can be', () => {
  const rows = (component) => Object.fromEntries(transformerSpecs(component).derived)
  const full = rows(output({ primaryImpedance: '4.2 kΩ', secondaryImpedance: '8 Ω', wattage: '50' }))
  assert.equal(full['Turns ratio (primary : secondary)'], '22.9 : 1')
  assert.equal(full['Secondary at full power'], '20 V, 2.5 A')
  assert.equal(rows(output({ primaryImpedance: '4.2 kΩ', secondaryImpedance: '8 Ω' }))['Secondary at full power'], undefined)
  assert.deepEqual(transformerSpecs(output({ primaryImpedance: '', secondaryImpedance: '8 Ω' })).derived, [])
  const mains = rows(part('power-transformer', 0, 0, 0, 'PT1', '', { primaryVoltage: '230', wattage: '115' }))
  assert.match(mains['Primary current at full load'], /^500 mA/)
  assert.equal(transformerSpecs({ type: 'resistor' }), null)
  for (const type of TRANSFORMER_TYPES) assert.ok(transformerSpecs({ type }).windings.length >= 2, type)
})

test('terminals follow the symbol, turned with the part: an output transformer has a primary centre tap', () => {
  const points = (component) => Object.fromEntries(terminalsOf(component).map((item) => [item.pin, item.point]))
  assert.deepEqual(points(output()), { p1: [260, 180], pc: [260, 200], p2: [260, 220], s1: [340, 188], s2: [340, 212] })
  const turned = points(output({ rotation: 90 }))
  assert.deepEqual(
    [turned.p1, turned.pc, turned.s1],
    [
      [320, 160],
      [300, 160],
      [312, 240],
    ],
  )
  assert.equal(terminalsOf(part('power-transformer', 0, 0, 0, 'PT1', '')).length, 7)
  assert.deepEqual(Object.keys(points(part('interstage-transformer', 0, 0, 0, 'T1', ''))), ['p1', 'p2', 's1', 'sc', 's2'])
})

test('windings are their DC resistance: entered values win, typical ones are assumed otherwise', () => {
  const windings = transformerWindings(output({ primaryDcr: '100' }))
  assert.deepEqual(
    windings.map((item) => [item.a, item.b, item.ohms, item.assumed]),
    [
      ['p1', 'pc', 50, false],
      ['pc', 'p2', 50, false],
      ['s1', 's2', 0.4, true],
    ],
  )
  assert.deepEqual(
    transformerWindings(part('power-transformer', 0, 0, 0, 'PT1', '')).map((item) => item.ohms),
    [5, 50, 50, 0.1],
  )
  assert.deepEqual(transformerWindings({ type: 'resistor' }), [])
})

test('characteristics are saved with the circuit; a characteristic the kind does not have is rejected', () => {
  const diagram = (component) => JSON.stringify({ format: 'spark-circuit', version: 1, diagram: { components: [component], wires: [] } })
  const saved = output({ primaryImpedance: '4.2 kΩ', secondaryImpedance: '8 Ω', wattage: '50', primaryDcr: '150', secondaryDcr: '0.4' })
  assert.deepEqual(readSparkMetadata(diagram(saved)).components[0], saved)
  assert.throws(() => readSparkMetadata(diagram(output({ primaryVoltage: '230' }))), /invalid component/)
})

test('characteristics have BOM columns of their own, only when used, and read back from a BOM', () => {
  const circuit = {
    id: 'c',
    name: 'Amp',
    diagram: {
      components: [output({ primaryImpedance: '4.2 kΩ', secondaryImpedance: '8 Ω', wattage: '50', primaryDcr: '150' }), part('resistor', 0, 0, 0, 'R1', '1 kΩ')],
      wires: [],
    },
  }
  const bom = generateBom([circuit])
  assert.deepEqual([bom[0].type, bom[0].primaryImpedance, bom[0].wattage], ['output-transformer', '4.2 kΩ', '50'])
  const [header, ...rows] = bomToRows(bom, [circuit])
  assert.deepEqual(header.slice(7), ['Primary impedance', 'Secondary impedance', 'Primary DCR'])
  assert.deepEqual(rows[0].slice(7), ['4.2 kΩ', '8 Ω', '150'])
  const plain = bomToRows(generateBom([{ ...circuit, diagram: { components: [part('resistor', 0, 0, 0, 'R1', '1 kΩ')], wires: [] } }]), [circuit])
  assert.equal(plain[0].length, 7)
  const read = rowsToBom([header, ...rows], [circuit], 'c')
  assert.deepEqual([read[0].type, read[0].primaryImpedance, read[0].secondaryImpedance, read[0].primaryDcr], ['output-transformer', '4.2 kΩ', '8 Ω', '150'])
})

// V1 (300 V) feeds the output transformer's primary centre tap; one half of the primary goes through R1 to ground.
const plateCircuit = (extra = {}) => ({
  components: [part('source', 100, 200, 90, 'V1', '300 V'), part('resistor', 160, 100, 0, 'R1', '1 kΩ'), output(extra), part('ground', 120, 60, 0, 'GND', '')],
  wires: [
    wire([100, 160], [200, 160], [200, 200], [260, 200]),
    wire([260, 180], [230, 180], [230, 100], [200, 100]),
    wire([120, 100], [120, 60]),
    wire([100, 240], [60, 240], [60, 60], [120, 60]),
  ],
})

test('the primary of an output transformer is a resistance in the plate supply, and unused windings stay quiet', async () => {
  const report = await run(plateCircuit({ primaryDcr: '100' }))
  const transformer = report.parts.find((item) => item.label === 'OT1')
  // 300 V across the 50 Ω half and R1 in series.
  assert.ok(Math.abs(Math.abs(transformer.current) - 300 / 1050) < 1e-6, `current ${transformer.current}`)
  assert.ok(Math.abs(Math.abs(report.parts.find((item) => item.label === 'R1').voltage) - (300 * 1000) / 1050) < 1e-3)
  // The far end of the primary is not connected; the unwired secondary says nothing.
  const warnings = messages(report, 'warning')
  assert.ok(
    warnings.some((message) => /OT1 has a loose end: its primary end/.test(message)),
    warnings.join('|'),
  )
  assert.ok(!warnings.some((message) => /secondary/.test(message)))
})

test('typical winding resistances are assumed, and said so, when none is entered', () => {
  const build = buildNetlist(plateCircuit())
  assert.match(build.netlist, /^r\d+a n\d+ n\d+ 75 /m)
  const note = build.issues.find((issue) => /OT1 is simulated by the DC resistance/.test(issue.message))
  assert.match(note.message, /primary \(first half\) 75 Ω/)
  assert.doesNotMatch(
    buildNetlist(plateCircuit({ primaryDcr: '100', secondaryDcr: '0.5' }))
      .issues.map((issue) => issue.message)
      .join('|'),
    /Typical values are assumed/,
  )
  assert.ok(!build.issues.some((issue) => /Not simulated/.test(issue.message)))
})

test('a power transformer with only its primary wired reports nothing about its other windings', () => {
  const build = buildNetlist({
    components: [part('source', 100, 150, 90, 'V1', '12 V'), part('power-transformer', 300, 150, 0, 'PT1', '')],
    wires: [wire([100, 110], [180, 110], [180, 130], [260, 130]), wire([260, 170], [180, 170], [180, 190], [100, 190])],
  })
  assert.deepEqual(
    build.issues.filter((issue) => issue.severity === 'warning'),
    [],
  )
})
