import assert from 'node:assert/strict'
import test from 'node:test'
import { estimateRotation, leadPairs, rotationFor } from './orientation.js'

// A white image with black rectangles drawn as [x, y, width, height].
const drawing = (width, height, boxes) => {
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  for (const [left, top, w, h] of boxes) for (let y = top; y < top + h; y += 1) for (let x = left; x < left + w; x += 1) data.set([0, 0, 0, 255], (y * width + x) * 4)
  return { data, width, height }
}

// A part in a wire: two leads with a body-sized gap between them, and a rail running past.
const flat = drawing(240, 160, [
  [30, 80, 60, 2],
  [150, 80, 60, 2],
  [20, 30, 200, 2],
])
const upright = drawing(240, 160, [
  [120, 20, 2, 45],
  [120, 105, 2, 45],
  [20, 30, 200, 2],
])
const options = { type: 'resistor', scale: 1 }

test('two collinear leads with a gap show which way a part runs, whatever long wire passes by', () => {
  const lying = leadPairs(flat, [120, 81], options)
  assert.ok(lying.horizontal > 0 && lying.vertical === 0)
  const standing = leadPairs(upright, [120, 85], options)
  assert.ok(standing.vertical > 0 && standing.horizontal === 0)
  assert.equal(estimateRotation(flat, [120, 70], options), 0)
  assert.equal(estimateRotation(upright, [130, 85], options), 90)
})

test('the gap must suit the kind of part', () => {
  const capacitor = drawing(240, 160, [
    [20, 80, 100, 2],
    [126, 80, 100, 2],
  ])
  assert.ok(leadPairs(capacitor, [123, 81], { type: 'capacitor', scale: 1 }).horizontal > 0)
  assert.equal(leadPairs(capacitor, [123, 81], options).horizontal, 0)
})

test('text the OCR has read is blanked so lettering is not taken for leads', () => {
  const lettering = drawing(240, 160, [
    [100, 30, 2, 20],
    [100, 70, 2, 20],
  ])
  assert.equal(estimateRotation(lettering, [101, 60], options), 90)
  assert.equal(estimateRotation(lettering, [101, 60], { ...options, textBoxes: [[95, 25, 108, 95]] }), 0)
})

test('an empty area gives no turn', () => {
  assert.equal(estimateRotation(drawing(240, 160, []), [120, 80], options), 0)
})

test('only parts that can be turned are estimated, and a matched symbol keeps its own rotation', () => {
  const part = (type, extra = {}) => ({ type, center: [130, 85], box: [120, 78, 140, 92], ...extra })
  assert.equal(rotationFor(upright, part('12ax7')), 0)
  assert.equal(rotationFor(upright, part('resistor', { symbolRotation: 180 })), 180)
  assert.equal(
    rotationFor(
      drawing(2000, 160, [
        [120, 20, 2, 45],
        [120, 105, 2, 45],
      ]),
      part('resistor'),
    ),
    90,
  )
})

// A diagonal line of 2 px wide ink from (x0, y0) running `length` px along (dx, dy).
const stroke = (x0, y0, dx, dy, length) => Array.from({ length }, (_, i) => [x0 + dx * i, y0 + dy * i, 2, 2])

test('a diode drawn on a diagonal is turned 45°, other parts never are', () => {
  const down = drawing(240, 240, [...stroke(60, 60, 1, 1, 45), ...stroke(125, 125, 1, 1, 45)])
  const up = drawing(240, 240, [...stroke(60, 180, 1, -1, 45), ...stroke(125, 115, 1, -1, 45)])
  const diode = { type: 'diode', scale: 1 }
  assert.ok(leadPairs(down, [114, 114], diode).diagonalDown > 0)
  assert.equal(estimateRotation(down, [114, 114], diode), 45)
  assert.equal(estimateRotation(up, [114, 126], diode), 315)
  assert.equal(leadPairs(down, [114, 114], { type: 'resistor', scale: 1 }).diagonalDown, undefined)
  assert.equal(estimateRotation(down, [114, 114], { type: 'resistor', scale: 1 }), 0)
  assert.equal(
    estimateRotation(
      drawing(240, 160, [
        [120, 20, 2, 45],
        [120, 90, 2, 45],
      ]),
      [128, 78],
      diode,
    ),
    90,
  )
})
