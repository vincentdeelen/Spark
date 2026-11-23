import test from 'node:test'
import assert from 'node:assert/strict'
import { detectStraightWires } from './wireDetection.js'

test('straight-wire detection merges thick lines, ignores short marks, and snaps endpoints', () => {
  const width = 200
  const height = 140
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  const black = (x, y) => {
    const i = (y * width + x) * 4
    data[i] = data[i + 1] = data[i + 2] = 0
  }
  for (let y = 39; y <= 41; y += 1) for (let x = 20; x <= 160; x += 1) black(x, y)
  for (let x = 99; x <= 101; x += 1) for (let y = 60; y <= 120; y += 1) black(x, y)
  for (let x = 10; x < 30; x += 1) black(x, 100)
  let id = 0
  const result = detectStraightWires({ data, width, height }, () => String(++id))
  assert.equal(result.truncated, false)
  assert.deepEqual(
    result.wires.map((wire) => wire.points),
    [
      [
        [20, 40],
        [160, 40],
      ],
      [
        [100, 60],
        [100, 120],
      ],
    ],
  )
})
