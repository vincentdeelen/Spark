import test from 'node:test'
import assert from 'node:assert/strict'
import { isTwoTerminal } from './partGeometry.js'
import { prepareArrangement } from './connections.js'

const component = (id, x, y, type = 'resistor', rotation = 0) => ({ id, x, y, type, rotation, label: id, value: '1 kΩ' })
const ids = () => {
  let next = 0
  return () => `new-${++next}`
}

test('series arranges three components and removes wires touching their terminals', () => {
  const diagram = {
    components: [component('a', 200, 200), component('b', 400, 200, 'capacitor', 90), component('c', 600, 200)],
    wires: [
      {
        id: 'old',
        points: [
          [360, 160],
          [440, 160],
        ],
      },
    ],
  }
  const result = prepareArrangement(diagram, ['a', 'b', 'c'], 'series', ids())
  assert.equal(result.error, undefined)
  assert.deepEqual(
    result.removedWires.map((wire) => wire.id),
    ['old'],
  )
  assert.deepEqual(
    result.diagram.components.map(({ x, y, rotation }) => [x, y, rotation]),
    [
      [280, 200, 0],
      [400, 200, 0],
      [520, 200, 0],
    ],
  )
  assert.deepEqual(
    result.diagram.wires.map((wire) => wire.points),
    [
      [
        [320, 200],
        [360, 200],
      ],
      [
        [440, 200],
        [480, 200],
      ],
    ],
  )
})

test('parallel connects each terminal to a common rail and switching removes the entire prior arrangement', () => {
  const diagram = { components: [component('a', 300, 240), component('b', 500, 240), component('c', 700, 240)], wires: [] }
  const makeId = ids()
  const parallel = prepareArrangement(diagram, ['a', 'b', 'c'], 'parallel', makeId)
  assert.equal(parallel.error, undefined)
  assert.equal(parallel.diagram.wires.length, 8)
  assert.deepEqual(
    parallel.diagram.wires.slice(0, 2).map((wire) => wire.points),
    [
      [
        [420, 120],
        [420, 360],
      ],
      [
        [580, 120],
        [580, 360],
      ],
    ],
  )
  assert.deepEqual(
    parallel.diagram.wires.slice(2).map((wire) => wire.points),
    [
      [
        [420, 120],
        [460, 120],
      ],
      [
        [540, 120],
        [580, 120],
      ],
      [
        [420, 240],
        [460, 240],
      ],
      [
        [540, 240],
        [580, 240],
      ],
      [
        [420, 360],
        [460, 360],
      ],
      [
        [540, 360],
        [580, 360],
      ],
    ],
  )
  const series = prepareArrangement(parallel.diagram, ['a', 'b', 'c'], 'series', makeId)
  assert.equal(series.error, undefined)
  assert.equal(series.removedWires.length, 8)
  assert.equal(series.diagram.wires.length, 2)
})

test('retains unrelated wires and rejects layouts that would touch them', () => {
  const diagram = {
    components: [component('a', 200, 200), component('b', 400, 200)],
    wires: [
      {
        id: 'unrelated',
        points: [
          [300, 120],
          [300, 280],
        ],
      },
    ],
  }
  const result = prepareArrangement(diagram, ['a', 'b'], 'series', ids())
  assert.match(result.error, /overlap/)
  assert.deepEqual(
    diagram.components.map((item) => item.x),
    [200, 400],
  )
  assert.equal(diagram.wires[0].id, 'unrelated')
})

test('rejects multi-terminal components and overlapping other components', () => {
  assert.equal(isTwoTerminal(component('pot', 0, 0, 'potentiometer')), false)
  assert.equal(isTwoTerminal(component('fuse', 0, 0, 'fuse')), true)
  const diagram = { components: [component('a', 200, 200), component('b', 400, 200), component('c', 300, 200, 'ground')], wires: [] }
  assert.match(prepareArrangement(diagram, ['a', 'c'], 'parallel', ids()).error, /two-terminal/)
  assert.match(prepareArrangement(diagram, ['a', 'b'], 'parallel', ids()).error, /overlap/)
})

test('switching a generated arrangement preserves unrelated wires', () => {
  const diagram = {
    components: [component('a', 300, 240), component('b', 500, 240)],
    wires: [
      {
        id: 'unrelated',
        points: [
          [100, 100],
          [140, 100],
        ],
      },
    ],
  }
  const makeId = ids()
  const parallel = prepareArrangement(diagram, ['a', 'b'], 'parallel', makeId)
  const series = prepareArrangement(parallel.diagram, ['a', 'b'], 'series', makeId)
  assert.equal(series.error, undefined)
  assert.equal(series.removedWires.length, 6)
  assert.equal(
    series.diagram.wires.find((wire) => wire.id === 'unrelated'),
    diagram.wires[0],
  )
})

test('arranging imported components preserves their reference image', () => {
  const reference = { dataUrl: 'data:image/png;base64,AAAA' }
  const diagram = { components: [component('a', 300, 240), component('b', 500, 240)], wires: [], reference }
  assert.equal(prepareArrangement(diagram, ['a', 'b'], 'series', ids()).diagram.reference, reference)
})
