import assert from 'node:assert/strict'
import test from 'node:test'
import { createComponent } from './diagramOps.js'
import { readSparkMetadata } from '../project/circuitFile.js'
import { connectionDots } from './junctions.js'
import { RIBBON_TYPE, nextPins, resizePins, withRibbonPins } from './ribbon.js'
import { terminalsOf } from './partGeometry.js'
import { exportSection } from './sections.js'
import { nearestWireEnd, wireEndMarkers, withWireEnd } from './wireMarkers.js'
import { findLibraryItem } from './library.js'
const ribbonPinPoints = (component) => terminalsOf(component).map((terminal) => terminal.point)
const ribbon = (extra = {}) => ({ id: 'w', type: RIBBON_TYPE, x: 300, y: 200, rotation: 0, label: 'W1', value: '4-way ribbon', pins: [1, 2, 3, 4], ...extra })
const metadata = (diagram) => JSON.stringify({ format: 'spark-circuit', version: 1, diagram })

test('a new ribbon cable continues the J numbering of cables already drawn', () => {
  const placed = createComponent(findLibraryItem(RIBBON_TYPE), [ribbon()], { x: 0, y: 0 })
  assert.deepEqual(placed.pins, [5, 6, 7, 8, 9, 10])
  assert.equal(placed.label, 'W2')
  assert.deepEqual(nextPins([]), [1, 2, 3, 4, 5, 6])
})

test('changing the number of wires extends or trims the pins and keeps a generated value in step', () => {
  assert.deepEqual(resizePins([7, 8, 3], 5), [7, 8, 3, 9, 10])
  assert.deepEqual(resizePins([1, 2, 3, 4], 2), [1, 2])
  assert.deepEqual(resizePins([1, 2], 1), [1, 2])
  assert.equal(withRibbonPins(ribbon(), [1, 2]).value, '2-way ribbon')
  assert.equal(withRibbonPins(ribbon({ value: '10-pin IDC' }), [1, 2]).value, '10-pin IDC')
})

test('ribbon pins sit on both sides of the cable, turned with it, and wires ending there get a dot on the pin', () => {
  assert.deepEqual(ribbonPinPoints(ribbon({ pins: [1, 2] })), [
    [240, 190],
    [360, 190],
    [240, 210],
    [360, 210],
  ])
  assert.deepEqual(ribbonPinPoints(ribbon({ pins: [1, 2], rotation: 90 })), [
    [310, 140],
    [310, 260],
    [290, 140],
    [290, 260],
  ])
  const diagram = {
    components: [ribbon()],
    wires: [
      {
        id: 'a',
        points: [
          [200, 190],
          [242, 190],
        ],
      },
    ],
  }
  assert.deepEqual(connectionDots(diagram), [[240, 190]])
  const offPage = { ...diagram, wires: [{ ...diagram.wires[0], ends: { end: { marker: 'arrow-out' } } }] }
  assert.deepEqual(connectionDots(offPage), [])
})

test('wire end markers draw an arrow and a label beyond the end, in the direction of the wire', () => {
  const wire = withWireEnd(
    {
      id: 'a',
      points: [
        [100, 100],
        [200, 100],
      ],
    },
    'end',
    { marker: 'arrow-out', label: 'B+' },
  )
  assert.deepEqual(wireEndMarkers(wire), [{ key: 'end', arrow: '200,106 212,100 200,94', label: 'B+', x: 217, y: 104, anchor: 'start' }])
  const incoming = withWireEnd(
    {
      id: 'b',
      points: [
        [100, 100],
        [100, 50],
      ],
    },
    'start',
    { marker: 'arrow-in' },
  )
  assert.deepEqual(wireEndMarkers(incoming), [{ key: 'start', arrow: '94,112 100,100 106,112', label: '', x: 100, y: 126, anchor: 'middle' }])
  assert.equal(nearestWireEnd(wire, [190, 95]), 'end')
  assert.deepEqual(withWireEnd(wire, 'end', { marker: '', label: '' }), { id: 'a', points: wire.points })
})

test('circuit files keep ribbon pins and wire end markers, and reject invalid ones', () => {
  const wire = {
    id: 'a',
    points: [
      [0, 0],
      [50, 0],
    ],
    ends: { end: { marker: 'arrow-out', label: 'To sheet 2' } },
  }
  const read = readSparkMetadata(metadata({ components: [ribbon()], wires: [wire] }))
  assert.deepEqual(read.components[0].pins, [1, 2, 3, 4])
  assert.deepEqual(read.wires[0].ends, wire.ends)
  assert.throws(() => readSparkMetadata(metadata({ components: [ribbon({ pins: [1] })], wires: [] })), /invalid component/)
  assert.throws(() => readSparkMetadata(metadata({ components: [{ ...ribbon(), type: 'resistor' }], wires: [] })), /invalid component/)
  assert.throws(() => readSparkMetadata(metadata({ components: [], wires: [{ ...wire, ends: { end: { marker: 'circle' } } }] })), /invalid wire/)
})

test('a section export keeps an end marker only where the wire still ends', () => {
  const wire = {
    id: 'a',
    points: [
      [0, 50],
      [200, 50],
    ],
    ends: { start: { marker: 'arrow-in' }, end: { marker: 'arrow-out' } },
  }
  const [clipped] = exportSection({ components: [], wires: [wire] }, [100, 0, 300, 100], () => 'x').wires
  assert.deepEqual(clipped.ends, { end: { marker: 'arrow-out' } })
})
