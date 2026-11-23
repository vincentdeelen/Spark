import test from 'node:test'
import assert from 'node:assert/strict'
import { findLibraryItem } from './library.js'
import {
  changeSubtypes,
  changeWireEnd,
  createComponent,
  createWire,
  moveComponent,
  rotateComponents,
  scaleComponent,
  setRibbonWireCount,
  twoTerminalUnder,
  withoutElements,
} from './diagramOps.js'
import { nextReference } from './references.js'

const resistor = findLibraryItem('resistor')
const labelled = (...labels) => labels.map((label) => ({ label }))

test('next reference fills the first free number case-insensitively and ignores unrelated prefixes', () => {
  assert.equal(nextReference(resistor, []), 'R1')
  assert.equal(nextReference(resistor, labelled('R1', 'r2', 'C1', ' R4 ')), 'R3')
  assert.equal(nextReference(findLibraryItem('ground'), labelled('GND')), 'GND')
})

test('new components take their label and value from the toolbox item unless overridden', () => {
  const component = createComponent(resistor, labelled('R1'), { x: 40, y: 60 })
  assert.deepEqual({ ...component, id: undefined }, { id: undefined, type: 'resistor', x: 40, y: 60, rotation: 0, label: 'R2', value: '1 kΩ' })
  const trained = createComponent(resistor, [], { x: 0, y: 0, rotation: 90, label: 'R9', value: '' })
  assert.deepEqual([trained.label, trained.value, trained.rotation], ['R9', '', 90])
  assert.equal(createComponent(findLibraryItem('ground'), [], { x: 0, y: 0 }).value, '')
})

test('wires omit an empty label and removal drops matching components and wires', () => {
  assert.equal(
    'label' in
      createWire([
        [0, 0],
        [20, 0],
      ]),
    false,
  )
  assert.equal(
    createWire(
      [
        [0, 0],
        [20, 0],
      ],
      'IN',
    ).label,
    'IN',
  )
  const diagram = { components: [{ id: 'a' }, { id: 'b' }], wires: [{ id: 'w' }, { id: 'x' }], reference: null }
  assert.deepEqual(withoutElements(diagram, new Set(['a', 'x'])), { components: [{ id: 'b' }], wires: [{ id: 'w' }], reference: null })
})

test('rotating wraps around, and subtypes, wire counts and sizes change only the chosen parts', () => {
  const diagram = {
    components: [
      { id: 'a', type: 'resistor', x: 0, y: 0, rotation: 270, label: 'R1', value: '1 kΩ' },
      { id: 'b', type: 'resistor', x: 100, y: 0, rotation: 0, label: 'R2', value: '1 kΩ' },
      { id: 'w', type: 'ribbon-cable', x: 0, y: 100, rotation: 0, label: 'W1', value: '2-way ribbon', pins: [1, 2] },
    ],
    wires: [],
  }
  assert.deepEqual(
    rotateComponents(diagram, ['a']).components.map((item) => item.rotation),
    [0, 0, 0],
  )
  assert.deepEqual(
    rotateComponents(diagram, ['a', 'b'], 45).components.map((item) => item.rotation),
    [315, 45, 0],
  )
  assert.deepEqual(
    changeSubtypes(diagram, ['b'], 'metal-film-resistor').components.map((item) => item.type),
    ['resistor', 'metal-film-resistor', 'ribbon-cable'],
  )
  const wider = setRibbonWireCount(diagram, ['w'], 4).components[2]
  assert.deepEqual([wider.pins, wider.value], [[1, 2, 3, 4], '4-way ribbon'])
  assert.deepEqual(
    scaleComponent(diagram, 'a', 0.5).components.map((item) => item.scale),
    [0.5, undefined, undefined],
  )
  assert.equal(diagram.components[0].rotation, 270)
})

test('moving a component carries the wire ends attached to it', () => {
  const diagram = {
    components: [{ id: 'r', type: 'resistor', x: 100, y: 100, rotation: 0, label: 'R1', value: '1 kΩ' }],
    wires: [
      {
        id: 'w',
        points: [
          [0, 100],
          [60, 100],
        ],
      },
    ],
  }
  const moved = moveComponent(diagram, 'r', 20, 0, { w: ['end'] })
  assert.deepEqual([moved.components[0].x, moved.components[0].y], [120, 100])
  assert.deepEqual(moved.wires[0].points, [
    [0, 100],
    [80, 100],
  ])
  assert.deepEqual(moveComponent(diagram, 'r', 20, 0).wires, diagram.wires)
  assert.deepEqual(changeWireEnd(diagram, 'w', 'end', { marker: 'arrow-out' }).wires[0].ends, { end: { marker: 'arrow-out' } })
})

test('a two-terminal part placed on another two-terminal part is detected, not one placed on empty canvas', () => {
  const diagram = { components: [{ id: 'r', type: 'resistor', x: 100, y: 100, rotation: 0, label: 'R1', value: '1 kΩ' }], wires: [] }
  const placed = { id: 'c', type: 'capacitor', x: 110, y: 110, rotation: 0, label: 'C1', value: '1 nF' }
  assert.equal(twoTerminalUnder(diagram, placed, [110, 110]).id, 'r')
  assert.equal(twoTerminalUnder(diagram, placed, [300, 300]), undefined)
  assert.equal(twoTerminalUnder(diagram, { ...placed, type: 'ground' }, [110, 110]), undefined)
})
