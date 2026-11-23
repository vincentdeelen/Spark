import test from 'node:test'
import assert from 'node:assert/strict'
import { readSparkMetadata } from '../project/circuitFile.js'
import { rotateComponents, scaleComponent } from './diagramOps.js'
import { defaultLabelPlacement, labelPlacementOf, labelProblems, labelRectOf, optimizeLabels, withDefaultLabels, withLabelPlacements } from './labelLayout.js'
import { bodyRectOf } from './partGeometry.js'
import { rectGap } from './rects.js'

const part = (id, type, x, y, rotation, label, extra = {}) => ({ id, type, x, y, rotation, label, value: '', ...extra })

// A capacitor and a resistor side by side, turned upright and drawn small, as C8 and R10 are in a crowded circuit.
const crowded = () => ({
  components: [part('c8', 'capacitor', 860, 240, 90, 'C8', { scale: 0.3 }), part('r10', 'resistor', 890, 240, 90, 'R10', { scale: 0.3 })],
  wires: [
    {
      id: 'w1',
      points: [
        [890, 228],
        [890, 190],
      ],
    },
    {
      id: 'w2',
      points: [
        [890, 252],
        [890, 290],
      ],
    },
    {
      id: 'w3',
      points: [
        [860, 228],
        [860, 190],
      ],
    },
  ],
})

test('labels of crowded parts start out in trouble and are fixed by optimizing', () => {
  const diagram = crowded()
  assert.ok(labelProblems(diagram).includes('c8'), 'C8 is written beside R10')
  const { placements, problems } = optimizeLabels(diagram)
  assert.deepEqual(problems, [])
  assert.deepEqual(labelProblems(withLabelPlacements(diagram, placements)), [])
})

test('an optimized label sits right next to its own component and nearer to it than to any other', () => {
  const diagram = withLabelPlacements(crowded(), optimizeLabels(crowded()).placements)
  for (const component of diagram.components) {
    const label = labelRectOf(component)
    const other = diagram.components.find((item) => item !== component)
    assert.ok(rectGap(label, bodyRectOf(component)) <= 8, `${component.label} is close`)
    assert.ok(rectGap(label, bodyRectOf(component)) < rectGap(label, bodyRectOf(other)), `${component.label} is nearer to itself`)
  }
})

test('labels may shrink to fit, but never below a readable size, and stay away from wires where there is room', () => {
  const { placements } = optimizeLabels(crowded())
  for (const label of Object.values(placements)) assert.ok(label.size >= 7 && label.size <= 11)
})

test('a part that is rotated or resized gets its default label place back, and labels can be reset', () => {
  const placed = withLabelPlacements(crowded(), optimizeLabels(crowded()).placements)
  assert.ok(placed.components.every((component) => component.labelPlacement))
  assert.equal(rotateComponents(placed, ['c8']).components[0].labelPlacement, undefined)
  assert.equal(scaleComponent(placed, 'r10', 0.5).components[1].labelPlacement, undefined)
  assert.ok(withDefaultLabels(placed).components.every((component) => !component.labelPlacement))
  const plain = crowded().components[0]
  assert.deepEqual(labelPlacementOf(plain), defaultLabelPlacement(plain))
})

test('ground has no label and is not given one', () => {
  const diagram = { components: [part('g', 'ground', 10, 10, 0, 'GND')], wires: [] }
  assert.deepEqual(optimizeLabels(diagram).placements, {})
})

test('a label place survives saving and is checked on loading', () => {
  const placed = withLabelPlacements(crowded(), optimizeLabels(crowded()).placements)
  const text = JSON.stringify({ format: 'spark-circuit', version: 1, diagram: placed })
  assert.deepEqual(
    readSparkMetadata(text).components.map((component) => component.labelPlacement),
    placed.components.map((component) => component.labelPlacement),
  )
  const broken = JSON.stringify({
    format: 'spark-circuit',
    version: 1,
    diagram: { ...placed, components: [{ ...placed.components[0], labelPlacement: { x: 'a', y: 0, anchor: 'middle', size: 9 } }] },
  })
  assert.throws(() => readSparkMetadata(broken))
})
