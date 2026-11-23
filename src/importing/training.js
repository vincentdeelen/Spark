import { library } from '../circuit/library.js'
const key = 'spark-local-training-v1'
const detectorKey = 'live-wire-local-detector-v1'
const size = 12
const maxExamples = 50
const types = new Set(library.map((item) => item.type))

function validPatch(item) {
  return (
    Number.isInteger(item.width) &&
    Number.isInteger(item.height) &&
    item.width >= 6 &&
    item.height >= 6 &&
    item.width <= 300 &&
    item.height <= 300 &&
    Array.isArray(item.pixels) &&
    item.pixels.length === size * size &&
    item.pixels.every((pixel) => pixel === 0 || pixel === 1)
  )
}

function validComponent(item) {
  return item?.kind === 'component' && types.has(item.type) && [0, 90, 180, 270].includes(item.rotation) && validPatch(item)
}

function validDatasetFields(item) {
  return typeof item.source === 'string' && /^[a-f0-9]{64}$/.test(item.source) && ['train', 'validation'].includes(item.split)
}

export function readTraining(storage = localStorage) {
  const raw = storage.getItem(key)
  if (!raw) return []
  let examples
  try {
    examples = JSON.parse(raw)
  } catch {
    throw new Error('Local training data is damaged. Clear it to start again.')
  }
  if (
    !Array.isArray(examples) ||
    examples.length > maxExamples ||
    examples.some((item) => {
      if (item?.kind === 'wire')
        return (
          !Number.isFinite(item.threshold) || item.threshold < 140 || item.threshold > 220 || !Number.isInteger(item.minimumRun) || item.minimumRun < 10 || item.minimumRun > 45
        )
      if (item?.kind === 'negative') return !validPatch(item) || !validDatasetFields(item)
      return !validComponent(item) || ((item.source !== undefined || item.split !== undefined) && !validDatasetFields(item))
    })
  )
    throw new Error('Local training data is invalid. Clear it to start again.')
  return examples
}

export function saveExample(example, storage = localStorage) {
  const examples = readTraining(storage)
  if (examples.length >= maxExamples) throw new Error(`The local training library is full (${maxExamples} examples). Clear it before adding more.`)
  if (example.source && examples.some((item) => item.source === example.source && item.split !== example.split)) {
    throw new Error('This image already has examples in the other dataset. Use a different image for validation.')
  }
  storage.setItem(key, JSON.stringify([...examples, example]))
}

export function clearTraining(storage = localStorage) {
  storage.removeItem(key)
  storage.removeItem(detectorKey)
}

function darkAt(image, x, y, threshold = 170) {
  const i = (Math.floor(y) * image.width + Math.floor(x)) * 4
  return image.data[i + 3] > 128 && image.data[i] * 0.299 + image.data[i + 1] * 0.587 + image.data[i + 2] * 0.114 < threshold ? 1 : 0
}

function imagePatch(image, box) {
  const [left, top, right, bottom] = box.map(Math.round)
  const width = right - left
  const height = bottom - top
  if (left < 0 || top < 0 || right > image.width || bottom > image.height || width < 6 || height < 6 || width > 300 || height > 300) {
    throw new Error('Mark a symbol rectangle between 6 and 300 image pixels wide and high.')
  }
  const pixels = []
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) pixels.push(darkAt(image, left + ((x + 0.5) * width) / size, top + ((y + 0.5) * height) / size))
  }
  return { width, height, pixels }
}

export function componentExample(image, box, type, rotation) {
  const { width, height, pixels } = imagePatch(image, box)
  const ink = pixels.reduce((sum, pixel) => sum + pixel, 0)
  if (ink < 12 || ink > 110) throw new Error('This rectangle has too little or too much dark detail. Mark just the symbol, not its label or surrounding wires.')
  return { kind: 'component', type, rotation, width, height, pixels }
}

export function negativeExample(image, box) {
  return { kind: 'negative', ...imagePatch(image, box) }
}

export function wireExample(image, start, end) {
  const [x1, y1] = start.map(Math.round)
  const [x2, y2] = end.map(Math.round)
  const horizontal = Math.abs(x2 - x1) >= Math.abs(y2 - y1)
  if (Math.min(x1, x2, y1, y2) < 0 || Math.max(x1, x2) >= image.width || Math.max(y1, y2) >= image.height || (horizontal ? Math.abs(y2 - y1) : Math.abs(x2 - x1)) > 6)
    throw new Error('Mark the two ends of one horizontal or vertical wire.')
  const length = horizontal ? Math.abs(x2 - x1) : Math.abs(y2 - y1)
  if (length < 20) throw new Error('Mark a wire at least 20 image pixels long.')
  const values = []
  for (let i = 0; i <= length; i += 1) {
    const t = i / length
    const x = Math.round(x1 + (x2 - x1) * t)
    const y = Math.round(y1 + (y2 - y1) * t)
    const index = (y * image.width + x) * 4
    values.push(image.data[index] * 0.299 + image.data[index + 1] * 0.587 + image.data[index + 2] * 0.114)
  }
  values.sort((a, b) => a - b)
  const median = values[Math.floor(values.length / 2)]
  if (median > 200) throw new Error('The marked line is too light. Click along the center of the wire.')
  return { kind: 'wire', threshold: Math.max(140, Math.min(220, Math.ceil(median + 20))), minimumRun: Math.max(10, Math.min(45, Math.floor(length / 2))) }
}

export function wireSettings(examples) {
  const wires = examples.filter((item) => item.kind === 'wire')
  return wires.length ? { threshold: Math.max(140, ...wires.map((item) => item.threshold)), minimumRun: Math.min(45, ...wires.map((item) => item.minimumRun)) } : {}
}

export function readDetector(storage = localStorage) {
  const raw = storage.getItem(detectorKey)
  if (!raw) return null
  let model
  try {
    model = JSON.parse(raw)
  } catch {
    throw new Error('The local detector is damaged. Clear examples to reset it.')
  }
  if (
    !model ||
    model.version !== 1 ||
    !Number.isFinite(model.threshold) ||
    model.threshold < 0.75 ||
    model.threshold > 0.98 ||
    !Array.isArray(model.templates) ||
    !model.templates.length ||
    model.templates.length > maxExamples ||
    model.templates.some((item) => !validComponent(item) || !validDatasetFields(item) || item.split !== 'train')
  ) {
    throw new Error('The local detector is invalid. Clear examples to reset it.')
  }
  return model
}

export function saveDetector(model, storage = localStorage) {
  storage.setItem(detectorKey, JSON.stringify(model))
}

function patchScore(a, b) {
  let both = 0
  let inkA = 0
  let inkB = 0
  for (let i = 0; i < a.pixels.length; i += 1) {
    inkA += a.pixels[i]
    inkB += b.pixels[i]
    both += a.pixels[i] * b.pixels[i]
  }
  return inkB >= 12 && inkB <= 110 ? (2 * both) / (inkA + inkB) : 0
}

function evaluatePatches(samples, templates, threshold, leaveSourceOut = false) {
  let truePositive = 0
  let falsePositive = 0
  let falseNegative = 0
  for (const sample of samples) {
    let best = null
    let bestScore = 0
    for (const template of templates) {
      if (leaveSourceOut && template.source === sample.source) continue
      const score = patchScore(template, sample)
      if (score > bestScore) {
        best = template
        bestScore = score
      }
    }
    const matched = best && bestScore >= threshold
    const correct = matched && sample.kind === 'component' && best.type === sample.type && best.rotation === sample.rotation
    if (correct) truePositive += 1
    else {
      if (matched) falsePositive += 1
      if (sample.kind === 'component') falseNegative += 1
    }
  }
  const denominator = 2 * truePositive + falsePositive + falseNegative
  return { truePositive, falsePositive, falseNegative, f1: denominator ? (2 * truePositive) / denominator : 0 }
}

export function runDetectorExperiments(examples, currentModel = null) {
  if (!currentModel && examples.some((item) => item.kind === 'component' && !validDatasetFields(item))) {
    throw new Error('Older component examples have no image identity. Clear examples before experimenting so validation stays separate.')
  }
  const annotated = examples.filter((item) => (item.kind === 'component' || item.kind === 'negative') && validDatasetFields(item))
  const train = annotated.filter((item) => item.split === 'train')
  const validation = annotated.filter((item) => item.split === 'validation')
  const templates = train.filter((item) => item.kind === 'component')
  const sources = new Set(templates.map((item) => item.source))
  if (sources.size < 2 || !train.some((item) => item.kind === 'negative')) {
    throw new Error('Mark components on at least two training images and at least one non-component training patch.')
  }
  if (!validation.some((item) => item.kind === 'component') || !validation.some((item) => item.kind === 'negative')) {
    throw new Error('Mark at least one component and one non-component on a separate validation image.')
  }
  if (validation.some((item) => train.some((entry) => entry.source === item.source))) {
    throw new Error('Training and validation images must be different.')
  }
  if (currentModel && validation.some((item) => currentModel.templates.some((entry) => entry.source === item.source))) {
    throw new Error('The active detector contains examples from a validation image. Clear examples to start a new experiment.')
  }
  const baseline = 0.9
  let threshold = baseline
  let trainResult = evaluatePatches(train, templates, threshold, true)
  for (let step = 75; step <= 98; step += 1) {
    const candidate = step / 100
    const result = evaluatePatches(train, templates, candidate, true)
    if (result.f1 > trainResult.f1) {
      threshold = candidate
      trainResult = result
    }
  }
  const baselineValidation = currentModel ? evaluatePatches(validation, currentModel.templates, currentModel.threshold) : evaluatePatches(validation, templates, baseline)
  const candidateValidation = evaluatePatches(validation, templates, threshold)
  return {
    threshold,
    trainResult,
    baselineValidation,
    candidateValidation,
    model: candidateValidation.f1 > baselineValidation.f1 ? { version: 1, threshold, templates } : null,
  }
}

// Scans the whole image, or only windows centred within `near.radius` of `near.center`, for the marked symbols.
export function findExamples(image, examples, threshold = 0.9, near = null) {
  const found = []
  for (const example of examples.filter((item) => item.kind === 'component')) {
    const { width, height, pixels } = example
    if (width > image.width || height > image.height) continue
    const stride = Math.max(1, Math.min(3, Math.floor(Math.min(width, height) / 16)))
    const ink = pixels.reduce((sum, pixel) => sum + pixel, 0)
    const offsets = [[], []]
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) offsets[pixels[y * size + x]].push([Math.floor(((x + 0.5) * width) / size), Math.floor(((y + 0.5) * height) / size)])
    }
    const topStart = near ? Math.max(0, Math.ceil(near.center[1] - near.radius - height / 2)) : 0
    const topEnd = near ? Math.min(image.height - height, Math.floor(near.center[1] + near.radius - height / 2)) : image.height - height
    const leftStart = near ? Math.max(0, Math.ceil(near.center[0] - near.radius - width / 2)) : 0
    const leftEnd = near ? Math.min(image.width - width, Math.floor(near.center[0] + near.radius - width / 2)) : image.width - width
    for (let top = topStart; top <= topEnd; top += stride) {
      for (let left = leftStart; left <= leftEnd; left += stride) {
        let both = 0
        let missed = 0
        const allowedMisses = Math.floor(ink * (1 - threshold / (2 - threshold)))
        for (const [x, y] of offsets[1]) {
          if (darkAt(image, left + x, top + y)) both += 1
          else if (++missed > allowedMisses) break
        }
        if (missed > allowedMisses) continue
        let candidateInk = both
        for (const [x, y] of offsets[0]) candidateInk += darkAt(image, left + x, top + y)
        const score = (2 * both) / (ink + candidateInk)
        if (score >= threshold && candidateInk >= 12 && candidateInk <= 110) {
          const item = { box: [left, top, left + width, top + height], type: example.type, rotation: example.rotation, score }
          const duplicate = found.findIndex((other) => {
            const box = other.box
            const intersection = Math.max(0, Math.min(left + width, box[2]) - Math.max(left, box[0])) * Math.max(0, Math.min(top + height, box[3]) - Math.max(top, box[1]))
            return intersection / Math.min(width * height, (box[2] - box[0]) * (box[3] - box[1])) > 0.5
          })
          if (duplicate >= 0) {
            if (score > found[duplicate].score) found[duplicate] = item
          } else if (found.length < 100) found.push(item)
          else {
            let lowest = 0
            for (let i = 1; i < found.length; i += 1) if (found[i].score < found[lowest].score) lowest = i
            if (score > found[lowest].score) found[lowest] = item
          }
        }
      }
    }
  }
  return found.sort((a, b) => b.score - a.score)
}

// The best match for a symbol of `type` within `radius` pixels of `center`, or null. Lets a proposed position snap onto the real symbol.
export function findNearestExample(image, examples, { type, center, radius, threshold = 0.9 }) {
  const candidates = examples.filter((item) => item.kind === 'component' && item.type === type)
  return candidates.length ? findExamples(image, candidates, threshold, { center, radius })[0] || null : null
}
