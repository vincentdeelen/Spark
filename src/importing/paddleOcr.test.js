import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeCtc, findTextBoxes, sampleToTensor, splitWords, wordBox } from './paddleOcr.js'

// A width x height image whose red channel is `10 * y + x`.
const gradient = (width, height) => {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) data.set([10 * y + x, 0, 0, 255], (y * width + x) * 4)
  return { data, width, height }
}
const red = (tensor, width, height) => Array.from(tensor.slice(2 * width * height, 3 * width * height)).map((value) => Math.round(value))

test('a region is sampled upright and turned a quarter turn either way', () => {
  const image = gradient(3, 2)
  const options = { mean: [0, 0, 0], std: [1 / 255, 1 / 255, 1 / 255] }
  const whole = { x: 0, y: 0, width: 3, height: 2 }
  assert.deepEqual(red(sampleToTensor(image, whole, 3, 2, options), 3, 2), [0, 1, 2, 10, 11, 12])
  // Text reading upwards becomes horizontal after a clockwise turn: the bottom row comes first.
  assert.deepEqual(red(sampleToTensor(image, whole, 2, 3, { ...options, rotate: 'cw' }), 2, 3), [10, 0, 11, 1, 12, 2])
  assert.deepEqual(red(sampleToTensor(image, whole, 2, 3, { ...options, rotate: 'ccw' }), 2, 3), [2, 12, 1, 11, 0, 10])
})

test('text regions are found in a detector map and padded', () => {
  const width = 40
  const height = 20
  const map = new Float32Array(width * height)
  for (let y = 8; y < 12; y += 1) for (let x = 10; x < 30; x += 1) map[y * width + x] = 0.9
  map[0] = 0.9
  const boxes = findTextBoxes(map, width, height)
  assert.equal(boxes.length, 1)
  assert.ok(boxes[0].x < 10 && boxes[0].x + boxes[0].width > 30)
  assert.ok(boxes[0].y < 8 && boxes[0].y + boxes[0].height > 12)
})

test('recogniser output is decoded by CTC rules', () => {
  const characters = ['A', 'B']
  const classes = 3
  const steps = [1, 1, 0, 1, 2, 2]
  const output = new Float32Array(steps.length * classes)
  steps.forEach((best, step) => (output[step * classes + best] = 0.9))
  const chars = decodeCtc(output, steps.length, classes, characters)
  assert.deepEqual(
    chars.map((item) => [item.char, item.start, item.end]),
    [
      ['A', 0, 2],
      ['A', 3, 4],
      ['B', 4, 6],
    ],
  )
})

test('words split at spaces and at gaps wider than a character', () => {
  const at = (char, start) => ({ char, start, end: start + 2, confidence: 0.9 })
  const spaced = splitWords([at('4', 0), at('7', 2), at(' ', 4), at('K', 5)])
  assert.deepEqual(
    spaced.map((word) => word.text),
    ['47', 'K'],
  )
  const gap = splitWords([at('R', 0), at('1', 2), at('4', 12), at('7', 14)])
  assert.deepEqual(
    gap.map((word) => word.text),
    ['R1', '47'],
  )
  assert.equal(splitWords([]).length, 0)
})

test('word spans map back onto the image for horizontal and vertical text', () => {
  const box = { x: 100, y: 200, width: 20, height: 100 }
  assert.deepEqual(wordBox({ x: 0, y: 0, width: 100, height: 10 }, 0, 50, 10, 20), { x: 20, y: 0, width: 20, height: 10 })
  // Reading upwards: the start of the text is at the bottom.
  assert.deepEqual(wordBox(box, 90, 50, 0, 10), { x: 100, y: 280, width: 20, height: 20 })
  // Reading downwards: the start of the text is at the top.
  assert.deepEqual(wordBox(box, 270, 50, 0, 10), { x: 100, y: 200, width: 20, height: 20 })
})
