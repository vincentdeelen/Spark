import assert from 'node:assert/strict'
import test from 'node:test'
import { connectionDots, wireHops, wirePath } from './junctions.js'

const wire = (id, points) => ({ id, points })
const resistor = { id: 'r', type: 'resistor', x: 210, y: 80, rotation: 90, label: 'R2', value: '', scale: 0.5 }

test('dots a wire ending on a two-terminal part at its terminal', () => {
  const dots = connectionDots({
    components: [resistor],
    wires: [
      wire('a', [
        [210, 140],
        [210, 140],
        [210, 90],
      ]),
    ],
  })
  assert.deepEqual(dots, [[210, 100]])
})

test('dots a wire ending on a multi-pin part where it ends', () => {
  const triode = { id: 't', type: '12ax7-triode', x: 210, y: 180, rotation: 0, label: 'V1A', value: '' }
  assert.deepEqual(
    connectionDots({
      components: [triode],
      wires: [
        wire('a', [
          [210, 138],
          [210, 120],
        ]),
      ],
    }),
    [[210, 138]],
  )
})

test('dots a tee and three meeting wire ends but not a wire continued by another', () => {
  const diagram = {
    components: [],
    wires: [
      wire('a', [
        [100, 100],
        [100, 200],
      ]),
      wire('b', [
        [100, 150],
        [200, 150],
      ]),
      wire('c', [
        [200, 150],
        [300, 150],
      ]),
      wire('d', [
        [300, 150],
        [300, 100],
      ]),
      wire('e', [
        [300, 150],
        [300, 200],
      ]),
    ],
  }
  assert.deepEqual(connectionDots(diagram), [
    [100, 150],
    [300, 150],
  ])
})

test('does not dot a wire continued inside a part or overlapping pieces of one straight run', () => {
  const diagram = {
    components: [resistor],
    wires: [
      wire('a', [
        [210, 30],
        [210, 70],
      ]),
      wire('b', [
        [210, 70],
        [210, 20],
      ]),
      wire('c', [
        [300, 100],
        [300, 140],
      ]),
      wire('d', [
        [300, 120],
        [300, 160],
      ]),
    ],
  }
  assert.deepEqual(connectionDots(diagram), [])
})

test('hops a crossing without a connection on the horizontal wire', () => {
  const diagram = {
    components: [],
    wires: [
      wire('h', [
        [100, 150],
        [300, 150],
      ]),
      wire('v', [
        [200, 100],
        [200, 200],
      ]),
      wire('t', [
        [250, 150],
        [250, 200],
      ]),
    ],
  }
  assert.deepEqual(wireHops(diagram), { h: [[200, 150]] })
  assert.deepEqual(connectionDots(diagram), [[250, 150]])
})

test('draws a hop as an arc over the top in either direction', () => {
  assert.equal(
    wirePath(
      [
        [100, 150],
        [300, 150],
      ],
      [[200, 150]],
    ),
    'M100 150 L195 150 A5 5 0 0 1 205 150 L300 150',
  )
  assert.equal(
    wirePath(
      [
        [300, 150],
        [100, 150],
      ],
      [[200, 150]],
    ),
    'M300 150 L205 150 A5 5 0 0 0 195 150 L100 150',
  )
  assert.equal(
    wirePath(
      [
        [100, 100],
        [100, 200],
      ],
      [],
    ),
    'M100 100 L100 200',
  )
})
