import assert from 'node:assert/strict'
import test from 'node:test'
import { canvasExtent } from './canvasExtent.js'

const empty = { components: [], wires: [] }

test('the drawing area is 1000×700 until the drawing needs more', () => {
  assert.deepEqual(canvasExtent(empty), [0, 0, 1000, 700])
  assert.deepEqual(
    canvasExtent({
      components: [],
      wires: [
        {
          id: 'a',
          points: [
            [200, 200],
            [800, 200],
          ],
        },
      ],
    }),
    [0, 0, 1000, 700],
  )
})

test('it grows around wires and components drawn near or past an edge', () => {
  const wire = {
    id: 'a',
    points: [
      [500, 300],
      [1250, 300],
      [1250, -40],
    ],
  }
  assert.deepEqual(canvasExtent({ components: [], wires: [wire] }), [0, -200, 1400, 700])
  const resistor = { id: 'r', type: 'resistor', x: 980, y: 650, rotation: 0, label: 'R1', value: '' }
  assert.deepEqual(canvasExtent({ components: [resistor], wires: [] }), [0, 0, 1200, 800])
})

test('it grows ahead of the cursor while a wire is drawn towards an edge', () => {
  assert.deepEqual(canvasExtent(empty, [500, 300]), [0, 0, 1000, 700])
  assert.deepEqual(canvasExtent(empty, [960, 690]), [0, 0, 1200, 900])
  assert.deepEqual(canvasExtent(empty, [30, 20]), [0, 0, 1000, 700])
  assert.deepEqual(canvasExtent(empty, [1100, 300]), [0, 0, 1300, 700])
})
