import test from 'node:test'
import assert from 'node:assert/strict'
import { clipWire, exportSection, validRegion } from './sections.js'

test('clips wires at section boundaries and preserves separate re-entry fragments', () => {
  const region = [0, 0, 100, 100]
  assert.deepEqual(
    clipWire(
      [
        [-10, 20],
        [50, 20],
        [110, 20],
        [110, 80],
        [50, 80],
        [-10, 80],
      ],
      region,
    ),
    [
      [
        [0, 20],
        [50, 20],
        [100, 20],
      ],
      [
        [100, 80],
        [50, 80],
        [0, 80],
      ],
    ],
  )
  assert.deepEqual(
    clipWire(
      [
        [-10, -10],
        [110, 110],
      ],
      region,
    ),
    [
      [
        [0, 0],
        [100, 100],
      ],
    ],
  )
  assert.deepEqual(
    clipWire(
      [
        [-20, -10],
        [120, -10],
      ],
      region,
    ),
    [],
  )
})

test('section export contains only its components and clipped wires without changing the source', () => {
  const inside = { id: 'a', x: 50, y: 50 }
  const outside = { id: 'b', x: 150, y: 50 }
  const wire = {
    id: 'w',
    points: [
      [-10, 20],
      [110, 20],
      [110, 80],
      [-10, 80],
    ],
    connectionGroup: 'g',
    componentIds: ['a', 'b'],
  }
  const diagram = { components: [inside, outside], wires: [wire], reference: { dataUrl: 'image' } }
  const section = exportSection(diagram, [0, 0, 100, 100], () => 'fragment')
  assert.deepEqual(section.components, [inside])
  assert.deepEqual(
    section.wires.map(({ id, points, componentIds }) => ({ id, points, componentIds })),
    [
      {
        id: 'w',
        points: [
          [0, 20],
          [100, 20],
        ],
        componentIds: ['a'],
      },
      {
        id: 'fragment',
        points: [
          [100, 80],
          [0, 80],
        ],
        componentIds: ['a'],
      },
    ],
  )
  assert.equal(diagram.wires[0], wire)
  assert.deepEqual(section.viewRegion, [0, 0, 100, 100])
})

test('rejects invalid view regions', () => {
  assert.equal(validRegion([0, 0, 100, 100]), true)
  assert.equal(validRegion([0, 0, 0, 100]), false)
  assert.equal(validRegion([0, 0, Infinity, 100]), false)
})
