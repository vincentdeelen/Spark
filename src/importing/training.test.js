import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clearTraining,
  componentExample,
  findExamples,
  findNearestExample,
  readDetector,
  readTraining,
  runDetectorExperiments,
  saveDetector,
  saveExample,
  wireExample,
  wireSettings,
} from './training.js'
import { detectStraightWires } from './wireDetection.js'

function image(width, height) {
  const data = new Uint8ClampedArray(width * height * 4).fill(255)
  return { data, width, height }
}

function shade(imageData, x, y, value = 0) {
  const i = (y * imageData.width + x) * 4
  imageData.data[i] = imageData.data[i + 1] = imageData.data[i + 2] = value
}

function store() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, next) => {
      values.set(key, next)
    },
    removeItem: (key) => {
      values.delete(key)
    },
  }
}

test('component marks persist locally and find a similar symbol in a later image', () => {
  const first = image(100, 60)
  const second = image(100, 60)
  const draw = (target, left, top) => {
    for (let y = 0; y < 24; y += 1)
      for (let x = 0; x < 24; x += 1) {
        if ((x >= 4 && x <= 7 && y >= 4 && y <= 19) || (y >= 16 && y <= 19 && x >= 4 && x <= 19)) shade(target, left + x, top + y)
      }
  }
  draw(first, 8, 8)
  draw(second, 56, 20)
  const example = componentExample(first, [8, 8, 32, 32], 'resistor', 90)
  const storage = store()
  saveExample(example, storage)
  const saved = readTraining(storage)
  const matches = findExamples(second, saved)
  assert.ok(matches.some((item) => item.type === 'resistor' && item.rotation === 90 && Math.abs(item.box[0] - 56) <= 4 && Math.abs(item.box[1] - 20) <= 4))
  assert.throws(() => componentExample(second, [0, 0, 24, 24], 'resistor', 0), /too little/)
  clearTraining(storage)
  assert.deepEqual(readTraining(storage), [])
})

test('wire examples change detection of faint or shorter lines', () => {
  const training = image(200, 100)
  for (let x = 20; x <= 79; x += 1) shade(training, x, 20, 180)
  const example = wireExample(training, [20, 20], [79, 20])
  const later = image(200, 100)
  for (let x = 20; x <= 49; x += 1) shade(later, x, 40, 180)
  assert.equal(detectStraightWires(later, () => 'w').wires.length, 0)
  assert.ok(detectStraightWires(later, () => 'w', wireSettings([example])).wires.length > 0)
  assert.throws(() => wireExample(training, [20, 40], [80, 40]), /too light/)
})

test('similar symbols remain detectable when their positions are not aligned to a coarse scan step', () => {
  const first = image(760, 360)
  const second = image(760, 360)
  const draw = (target, left, top) => {
    for (let y = 0; y < 62; y += 1)
      for (let x = 0; x < 62; x += 1) {
        if (x < 7 || x >= 55 || y < 7 || y >= 55) shade(target, left + x, top + y)
      }
  }
  draw(first, 288, 252)
  draw(second, 642, 252)
  const matches = findExamples(second, [componentExample(first, [288, 252, 350, 314], 'resistor', 0)])
  assert.ok(matches.some((item) => Math.abs(item.box[0] - 642) <= 3 && Math.abs(item.box[1] - 252) <= 3))
})

test('experiments retain a setting only when separate validation patches improve', () => {
  const source = (digit) => digit.repeat(64)
  const base = Array.from({ length: 144 }, (_, i) => Number(i < 40))
  const changed = (remove, add, count) => {
    const pixels = [...base]
    for (let i = 0; i < count; i += 1) {
      pixels[remove + i] = 0
      pixels[add + i] = 1
    }
    return pixels
  }
  const patch = (kind, pixels, id, split) => ({
    kind,
    pixels,
    width: 24,
    height: 24,
    source: source(id),
    split,
    ...(kind === 'component' ? { type: 'resistor', rotation: 0 } : {}),
  })
  const examples = [
    patch('component', base, 'a', 'train'),
    patch('component', changed(0, 40, 5), 'b', 'train'),
    patch('negative', changed(12, 55, 8), 'a', 'train'),
    patch('component', changed(5, 45, 5), 'c', 'validation'),
    patch('negative', changed(20, 70, 8), 'c', 'validation'),
  ]
  const result = runDetectorExperiments(examples)
  assert.ok(result.model)
  assert.ok(result.candidateValidation.f1 > result.baselineValidation.f1)
  assert.ok(result.model.templates.every((item) => item.split === 'train'))
  const scan = image(24, 24)
  for (let y = 0; y < 24; y += 1)
    for (let x = 0; x < 24; x += 1) {
      if (examples[3].pixels[Math.floor(y / 2) * 12 + Math.floor(x / 2)]) shade(scan, x, y)
    }
  assert.equal(findExamples(scan, result.model.templates).length, 0)
  assert.equal(findExamples(scan, result.model.templates, result.model.threshold).length, 1)
  const storage = store()
  saveDetector(result.model, storage)
  assert.deepEqual(readDetector(storage), result.model)
  assert.equal(runDetectorExperiments(examples, readDetector(storage)).model, null)
  clearTraining(storage)
  assert.equal(readDetector(storage), null)
})

test('experiments require independent labeled images and prevent split leakage', () => {
  const storage = store()
  const example = { kind: 'component', type: 'resistor', rotation: 0, width: 12, height: 12, pixels: Array(144).fill(1), source: 'a'.repeat(64), split: 'train' }
  saveExample(example, storage)
  assert.throws(() => saveExample({ ...example, split: 'validation' }, storage), /other dataset/)
  assert.throws(() => runDetectorExperiments(readTraining(storage)), /two training images/)
  const duplicateSource = [
    example,
    { ...example, source: 'b'.repeat(64) },
    { ...example, kind: 'negative' },
    { ...example, split: 'validation' },
    { ...example, kind: 'negative', split: 'validation' },
  ]
  assert.throws(() => runDetectorExperiments(duplicateSource), /must be different/)
  const { source: unusedSource, split: unusedSplit, ...legacy } = example
  assert.ok(unusedSource && unusedSplit)
  assert.throws(() => runDetectorExperiments([legacy]), /Older component examples/)
})

test('nearest-symbol search only considers windows around the predicted position and the requested type', () => {
  const picture = image(260, 160)
  const draw = (left, top) => {
    for (let x = 0; x < 40; x += 1) {
      shade(picture, left + x, top)
      shade(picture, left + x, top + 19)
    }
    for (let y = 0; y < 20; y += 1) {
      shade(picture, left, top + y)
      shade(picture, left + 39, top + y)
      shade(picture, left + 20, top + y)
    }
  }
  draw(20, 20)
  draw(180, 100)
  const example = componentExample(picture, [20, 20, 60, 40], 'resistor', 0)
  const near = (center, extra = {}) => findNearestExample(picture, [example], { type: 'resistor', center, radius: 30, ...extra })
  assert.deepEqual(near([200, 110])?.box, [180, 100, 220, 120])
  assert.deepEqual(near([40, 30])?.box, [20, 20, 60, 40])
  assert.equal(near([120, 80]), null)
  assert.equal(near([200, 110], { type: 'capacitor' }), null)
  assert.equal(findExamples(picture, [example]).length, 2)
})
