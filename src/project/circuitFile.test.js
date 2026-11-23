import test from 'node:test'
import assert from 'node:assert/strict'
import { readSparkMetadata } from './circuitFile.js'
import { formatComponentValue } from '../circuit/ratings.js'
const encode = (diagram) => JSON.stringify({ format: 'spark-circuit', version: 1, diagram })

test('Spark metadata restores editable components, wires, groups, and reference', () => {
  const diagram = {
    components: [{ id: 'a', type: 'zener-diode', x: 100, y: 120, rotation: 90, label: 'D1', value: '5 V' }],
    wires: [
      {
        id: 'w',
        points: [
          [100, 80],
          [100, 40],
        ],
        label: 'signal',
        connectionGroup: 'g',
        componentIds: ['a'],
      },
    ],
    reference: { dataUrl: 'data:image/png;base64,AAAA' },
  }
  assert.deepEqual(readSparkMetadata(encode(diagram)), diagram)
})

test('Spark metadata rejects unsupported and unsafe content', () => {
  assert.throws(() => readSparkMetadata('not JSON'), /invalid circuit metadata/)
  assert.throws(() => readSparkMetadata(JSON.stringify({ format: 'spark-circuit', version: 2, diagram: {} })), /Unsupported/)
  assert.throws(() => readSparkMetadata(encode({ components: [], wires: [], reference: { dataUrl: 'data:image/svg+xml;base64,AAAA' } })), /reference/)
  assert.throws(
    () =>
      readSparkMetadata(
        encode({
          components: [],
          wires: [
            {
              id: 'w',
              points: [
                [0, 0],
                [1, null],
              ],
            },
          ],
        }),
      ),
    /invalid wire/,
  )
  assert.throws(
    () =>
      readSparkMetadata(
        encode({
          components: [],
          wires: [
            {
              id: 'w',
              points: [
                [0, 0],
                [1, 1],
              ],
              label: 1,
            },
          ],
        }),
      ),
    /invalid wire/,
  )
  assert.throws(
    () =>
      readSparkMetadata(
        encode({
          components: [],
          wires: [
            {
              id: 'w',
              points: [
                [0, 0],
                [1, 1],
              ],
            },
            {
              id: 'w',
              points: [
                [0, 0],
                [2, 2],
              ],
            },
          ],
        }),
      ),
    /duplicate/,
  )
  assert.throws(() => readSparkMetadata(encode({ components: [], wires: [], viewRegion: [0, 0, 0, 10] })), /invalid section view/)
})

test('Spark metadata restores a section viewport', () => {
  const diagram = { components: [], wires: [], viewRegion: [20, 40, 200, 300] }
  assert.deepEqual(readSparkMetadata(encode(diagram)), diagram)
})

test('resistor ratings survive Spark metadata and appear alongside resistance', () => {
  const component = { id: 'r', type: 'metal-film-resistor', x: 100, y: 120, rotation: 0, label: 'R1', value: '1 kΩ', wattage: '0.25', tolerance: '5' }
  const restored = readSparkMetadata(encode({ components: [component], wires: [] })).components[0]
  assert.deepEqual(restored, component)
  assert.equal(formatComponentValue(restored), '1 kΩ · 0.25 W · ±5%')
  assert.equal(formatComponentValue({ ...component, wattage: '1/4 W', tolerance: '±1%' }), '1 kΩ · 1/4 W · ±1%')
  assert.equal(formatComponentValue({ ...component, value: '' }), '0.25 W · ±5%')
  assert.throws(() => readSparkMetadata(encode({ components: [{ ...component, tolerance: 5 }], wires: [] })), /invalid component/)
  assert.throws(() => readSparkMetadata(encode({ components: [{ ...component, type: 'diode' }], wires: [] })), /invalid component/)
})

test('diodes may be saved at 45° angles, other parts only in 90° steps', () => {
  const part = (type, rotation) => ({ id: 'p', type, x: 100, y: 100, rotation, label: 'X1', value: '' })
  for (const rotation of [45, 135, 315]) assert.equal(readSparkMetadata(encode({ components: [part('rectifier-diode', rotation)], wires: [] })).components[0].rotation, rotation)
  assert.throws(() => readSparkMetadata(encode({ components: [part('resistor', 45)], wires: [] })), /invalid component/)
  assert.throws(() => readSparkMetadata(encode({ components: [part('diode', 30)], wires: [] })), /invalid component/)
  assert.throws(() => readSparkMetadata(encode({ components: [part('diode', 360)], wires: [] })), /invalid component/)
})
