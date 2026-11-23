import test from 'node:test'
import assert from 'node:assert/strict'
import { rearrangeDiagram, connectionSignature, layoutMetrics } from './rearrange.js'
import { routeWire } from './wireRouting.js'

const resistor = (id, x, y) => ({ id, type: 'resistor', x, y, rotation: 90, label: id.toUpperCase(), value: '1 kΩ' })
const wire = (id, points) => ({ id, points })
const sequential = () => {
  let count = 0
  return () => `new${(count += 1)}`
}

// R1 is wired to R4 and R2 to R3, so the two wires have to cross.
const crossed = () => ({
  components: [resistor('r1', 100, 100), resistor('r2', 200, 100), resistor('r3', 100, 300), resistor('r4', 200, 300)],
  wires: [
    wire('w1', [
      [100, 140],
      [100, 200],
      [200, 200],
      [200, 260],
    ]),
    wire('w2', [
      [200, 140],
      [200, 170],
      [150, 170],
      [150, 230],
      [100, 230],
      [100, 260],
    ]),
  ],
})

test('rearranging removes a crossing without changing what is connected to what', () => {
  const diagram = crossed()
  assert.equal(layoutMetrics(diagram).hops, 1)
  const result = rearrangeDiagram(diagram, { makeNewId: sequential() })
  assert.equal(result.changed, true)
  assert.equal(layoutMetrics(result.diagram).hops, 0)
  assert.equal(connectionSignature(result.diagram), connectionSignature(diagram))
  assert.deepEqual(result.after, layoutMetrics(result.diagram))
  assert.ok(result.moved >= 1)
})

test('the original circuit is not modified, and wires keep their ids, labels and arrows', () => {
  const diagram = crossed()
  diagram.wires[0] = { ...diagram.wires[0], label: 'signal', ends: { end: { marker: 'arrow-out', label: 'Next' } } }
  const copy = structuredClone(diagram)
  const result = rearrangeDiagram(diagram, { makeNewId: sequential() })
  assert.deepEqual(diagram, copy)
  const moved = result.diagram.wires.find((item) => item.id === 'w1')
  assert.equal(moved.label, 'signal')
  assert.deepEqual(moved.ends, { end: { marker: 'arrow-out', label: 'Next' } })
})

test('a part keeps the wire ends it had, whatever way it moves', () => {
  const diagram = crossed()
  const result = rearrangeDiagram(diagram, { makeNewId: sequential() })
  for (const before of diagram.components) {
    const after = result.diagram.components.find((item) => item.id === before.id)
    assert.equal(after.rotation, before.rotation)
    assert.ok(after.x % 10 === 0 && after.y % 10 === 0, 'on the grid')
  }
})

test('a circuit that is already tidy comes back as it was, with the reason', () => {
  const tidy = {
    components: [resistor('r1', 100, 100), resistor('r2', 100, 200)],
    wires: [
      wire('w1', [
        [100, 140],
        [100, 160],
      ]),
    ],
  }
  const result = rearrangeDiagram(tidy, { makeNewId: sequential() })
  assert.equal(result.changed, false)
  assert.equal(result.diagram, tidy)
  assert.ok(result.reason)
})

test('a wire that ends on another wire stays connected to it', () => {
  // R3 hangs off the middle of the wire from R1 to R2.
  const diagram = {
    components: [resistor('r1', 100, 100), resistor('r2', 300, 100), resistor('r3', 200, 300), resistor('r4', 100, 300)],
    wires: [
      wire('bus', [
        [100, 140],
        [100, 200],
        [300, 200],
        [300, 140],
      ]),
      wire('stub', [
        [200, 200],
        [200, 260],
      ]),
      wire('other', [
        [100, 260],
        [100, 270],
        [60, 270],
      ]),
    ],
  }
  const result = rearrangeDiagram(diagram, { makeNewId: sequential() })
  assert.equal(connectionSignature(result.diagram), connectionSignature(diagram))
})

test('a wire is routed around a part in its way and keeps clear of other wires', () => {
  const world = {
    otherSegments: [
      [
        [50, 100],
        [150, 100],
      ],
    ],
    sameSegments: [],
    nodes: [],
    bodies: [{ id: 'blocker', rect: [90, 20, 110, 80] }],
    ownIds: new Set(),
  }
  const { points } = routeWire([100, 0], [100, 200], { world })
  const segments = points.slice(1).map((point, index) => [points[index], point])
  assert.ok(
    segments.every(([[ax, ay], [bx, by]]) => !(ax === bx && ax > 90 && ax < 110 && Math.max(ay, by) > 20 && Math.min(ay, by) < 80)),
    'not through the part',
  )
  assert.ok(points[0][0] === 100 && points[points.length - 1][1] === 200)
})
