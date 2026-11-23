import assert from 'node:assert/strict'
import test from 'node:test'
import { changeSubtype, findWireAt, insertIntoWire } from './diagramOps.js'
import { snapToGrid } from '../shared/grid.js'

const resistor = { id: 'r', type: 'resistor', x: 300, y: 200, rotation: 0, label: 'R5', value: '1 kΩ' }
const diagramWith = (wires, components = [resistor]) => ({ components, wires })
let counter = 0
const newId = () => `w${(counter += 1)}`

test('the wire under a point is found within reach and projected onto', () => {
  const diagram = diagramWith([
    {
      id: 'a',
      points: [
        [100, 100],
        [400, 100],
        [400, 300],
      ],
    },
  ])
  assert.deepEqual(findWireAt(diagram, [250, 108]), { wire: diagram.wires[0], index: 0, point: [250, 100] })
  assert.equal(findWireAt(diagram, [250, 130]), null)
  assert.equal(findWireAt(diagram, [405, 200]).index, 1)
})

test('a component dropped on a horizontal wire is connected in series by cutting the wire', () => {
  const diagram = diagramWith([
    {
      id: 'a',
      label: 'in',
      points: [
        [100, 200],
        [500, 200],
      ],
    },
  ])
  const result = insertIntoWire(diagram, 'r', [300, 205], snapToGrid, newId)
  const placed = result.components[0]
  assert.deepEqual([placed.x, placed.y, placed.rotation], [300, 200, 0])
  assert.equal(result.wires.length, 2)
  assert.deepEqual(result.wires[0].points, [
    [100, 200],
    [260, 200],
  ])
  assert.deepEqual(result.wires[1].points, [
    [340, 200],
    [500, 200],
  ])
  assert.equal(result.wires[0].id, 'a')
  assert.equal(result.wires[1].label, 'in')
})

test('a vertical wire turns the component and keeps the rest of a bent wire', () => {
  const diagram = diagramWith([
    {
      id: 'a',
      points: [
        [100, 100],
        [300, 100],
        [300, 400],
      ],
    },
  ])
  const result = insertIntoWire(diagram, 'r', [305, 260], snapToGrid, newId)
  assert.deepEqual([result.components[0].x, result.components[0].y, result.components[0].rotation], [300, 260, 90])
  assert.deepEqual(result.wires[0].points, [
    [100, 100],
    [300, 100],
    [300, 220],
  ])
  assert.deepEqual(result.wires[1].points, [
    [300, 300],
    [300, 400],
  ])
})

test('a wire that is too short, bent diagonally, or far away is left alone', () => {
  assert.equal(
    insertIntoWire(
      diagramWith([
        {
          id: 'a',
          points: [
            [280, 200],
            [340, 200],
          ],
        },
      ]),
      'r',
      [310, 200],
      snapToGrid,
    ),
    null,
  )
  assert.equal(
    insertIntoWire(
      diagramWith([
        {
          id: 'a',
          points: [
            [100, 100],
            [500, 300],
          ],
        },
      ]),
      'r',
      [300, 200],
      snapToGrid,
    ),
    null,
  )
  assert.equal(
    insertIntoWire(
      diagramWith([
        {
          id: 'a',
          points: [
            [100, 100],
            [500, 100],
          ],
        },
      ]),
      'r',
      [300, 200],
      snapToGrid,
    ),
    null,
  )
})

test('a wire end that meets the component exactly leaves no zero-length piece', () => {
  const result = insertIntoWire(
    diagramWith([
      {
        id: 'a',
        points: [
          [260, 200],
          [500, 200],
        ],
      },
    ]),
    'r',
    [300, 200],
    snapToGrid,
    newId,
  )
  assert.equal(result.wires.length, 1)
  assert.deepEqual(result.wires[0].points, [
    [340, 200],
    [500, 200],
  ])
})

test('changing subtype keeps the label, drops ratings the new type lacks and follows default values', () => {
  const pot = changeSubtype({ ...resistor, wattage: '0.5', tolerance: '5' }, 'potentiometer')
  assert.equal(pot.type, 'potentiometer')
  assert.equal(pot.label, 'R5')
  assert.equal(pot.value, '10 kΩ')
  assert.equal(pot.wattage, '0.5')
  assert.equal(changeSubtype({ ...resistor, value: '47 kΩ' }, 'potentiometer').value, '47 kΩ')
  const fuse = changeSubtype({ id: 'f', type: 'fuse', x: 0, y: 0, rotation: 0, label: 'F1', value: '1 A' }, 'glass-fuse')
  assert.equal(fuse.speed, 'fast')
  const section = changeSubtype({ id: 'v', type: '12ax7', x: 0, y: 0, rotation: 0, label: 'V2B', value: '12AX7' }, '12ax7-triode')
  assert.equal(section.section, 'B')
  assert.equal(changeSubtype({ ...resistor, wattage: '1' }, 'capacitor').wattage, undefined)
})

test('a diode turned 45° has its terminals on the diagonal', async () => {
  const { prepareArrangement } = await import('./connections.js')
  // A wire ending exactly on a diagonal terminal is treated as connected to it and replaced by the arrangement.
  const diode = { id: 'd', type: 'diode', x: 400, y: 300, rotation: 45, label: 'D1', value: '' }
  const other = { id: 'e', type: 'diode', x: 600, y: 300, rotation: 0, label: 'D2', value: '' }
  const lead = {
    id: 'w',
    points: [
      [428.284, 328.284],
      [480, 328.284],
    ],
  }
  const result = prepareArrangement({ components: [diode, other], wires: [lead] }, ['d', 'e'], 'series', () => 'n')
  assert.deepEqual(
    result.removedWires.map((wire) => wire.id),
    ['w'],
  )
})
