import test from 'node:test'
import assert from 'node:assert/strict'
import { nominalSymbolSize } from './partGeometry.js'
import { prepareArrangement } from './connections.js'
import { findLibraryItem } from './library.js'
import { createComponent, referenceScale } from './diagramOps.js'
import { readSparkMetadata } from '../project/circuitFile.js'
import { clampZoom, MAX_ZOOM, MIN_ZOOM, zoomIn, zoomOut } from '../shared/zoom.js'

const part = (id, x, scale) => ({ id, x, y: 200, type: 'resistor', rotation: 0, label: id, value: '1k', ...(scale ? { scale } : {}) })

test('zoom runs from 10% to 500% in steps that never skip past either end', () => {
  assert.deepEqual([MIN_ZOOM, MAX_ZOOM], [10, 500])
  assert.equal(zoomOut(50), 25)
  assert.equal(zoomOut(25), 10)
  assert.equal(zoomOut(10), 10)
  assert.equal(zoomIn(100), 125)
  assert.equal(zoomIn(400), 500)
  assert.equal(zoomIn(500), 500)
  assert.equal(zoomIn(130), 150)
  assert.equal(clampZoom(9000), 500)
  assert.equal(clampZoom(1), 10)
})

test('components added on a reference take the size of the ones already matched to it', () => {
  assert.equal(referenceScale([part('a', 0)]), 1)
  assert.equal(referenceScale([part('a', 0, 0.5), part('b', 0, 2), part('c', 0, 0.6)]), 0.6)
  const added = createComponent(findLibraryItem('resistor'), [], { x: 0, y: 0, scale: 0.6 })
  assert.equal(added.scale, 0.6)
  assert.equal('scale' in createComponent(findLibraryItem('resistor'), [], { x: 0, y: 0 }), false)
  assert.ok(nominalSymbolSize('12ax7') > nominalSymbolSize('resistor'))
})

test('series wires meet the terminals of resized components', () => {
  const diagram = { components: [part('a', 200, 2), part('b', 500, 0.5)], wires: [] }
  const { diagram: arranged } = prepareArrangement(diagram, ['a', 'b'], 'series', () => 'w')
  const [a, b] = arranged.components
  assert.deepEqual(arranged.wires[0].points, [
    [a.x + 80, 200],
    [b.x - 20, 200],
  ])
})

test('imported components keep a valid size and reject impossible ones', () => {
  const read = (scale) => readSparkMetadata(JSON.stringify({ format: 'spark-circuit', version: 1, diagram: { components: [{ ...part('a', 100), scale }], wires: [] } }))
  assert.equal(read(0.4).components[0].scale, 0.4)
  assert.throws(() => read(0), /invalid component/)
  assert.throws(() => read(50), /invalid component/)
  assert.throws(() => read('2'), /invalid component/)
})

test('dragging a resize handle scales the component in proportion to its distance from the centre', async () => {
  const { resizedScale } = await import('../shared/zoom.js')
  const center = [100, 100]
  assert.equal(resizedScale(1, center, [148, 136], [196, 172]), 2)
  assert.equal(resizedScale(1.5, center, [148, 136], [124, 118]), 0.75)
  assert.equal(resizedScale(1, center, [148, 136], [100, 100]), 0.1)
  assert.equal(resizedScale(1, center, [148, 136], [1000, 1000]), 10)
  assert.equal(resizedScale(1.25, center, [100, 100], [200, 200]), 1.25)
})

test("a detected part is sized from the height of the drawing's reference labels", async () => {
  const { scaleFromLabelHeight } = await import('./partGeometry.js')
  // Labels about 12 diagram units high: two-terminal parts come out near the 0.4 the Classic 50 main board needed.
  assert.equal(scaleFromLabelHeight('resistor', 12), 0.39)
  assert.equal(scaleFromLabelHeight('el84', 12), 0.62)
  assert.equal(scaleFromLabelHeight('resistor', 0), null)
  assert.equal(scaleFromLabelHeight('resistor', 1000), 10)
})
