import assert from 'node:assert/strict'
import test from 'node:test'
import { attachedEnds, followMove, simplifyPoints } from './wireFollow.js'

const resistor = { id: 'r', type: 'resistor', x: 440, y: 180, rotation: 0, label: 'R1', value: '' }
const diagram = {
  components: [resistor],
  wires: [
    {
      id: 'left',
      points: [
        [200, 260],
        [200, 180],
        [400, 180],
      ],
    },
    {
      id: 'right',
      points: [
        [480, 180],
        [680, 180],
      ],
    },
    {
      id: 'away',
      points: [
        [100, 100],
        [300, 100],
      ],
    },
  ],
}

test('finds the wire ends that sit on a component', () => {
  assert.deepEqual(attachedEnds(diagram, ['r']), { left: ['end'], right: ['start'] })
})

test('wires follow a moved component and stay horizontal and vertical', () => {
  const [left, right, away] = followMove(diagram.wires, attachedEnds(diagram, ['r']), 40, -60)
  // The bend moves up with the run that ends on the component.
  assert.deepEqual(left.points, [
    [200, 260],
    [200, 120],
    [440, 120],
  ])
  // A straight wire gets a step half way so it still leaves the component sideways.
  assert.deepEqual(right.points, [
    [520, 120],
    [600, 120],
    [600, 180],
    [680, 180],
  ])
  assert.equal(away, diagram.wires[2])
})

test('a move along the wire only stretches it, and a wire on both ends moves whole', () => {
  const [, right] = followMove(diagram.wires, { right: ['start'] }, -20, 0)
  assert.deepEqual(right.points, [
    [460, 180],
    [680, 180],
  ])
  const [moved] = followMove(
    [
      {
        id: 'w',
        points: [
          [0, 0],
          [0, 50],
        ],
      },
    ],
    { w: ['start', 'end'] },
    10,
    10,
  )
  assert.deepEqual(moved.points, [
    [10, 10],
    [10, 60],
  ])
})

test('simplifies repeated points and straight-through corners', () => {
  assert.deepEqual(
    simplifyPoints([
      [210, 140],
      [210, 140],
      [210, 90],
    ]),
    [
      [210, 140],
      [210, 90],
    ],
  )
  assert.deepEqual(
    simplifyPoints([
      [0, 0],
      [10, 0],
      [20, 0],
      [20, 10],
    ]),
    [
      [0, 0],
      [20, 0],
      [20, 10],
    ],
  )
})
