// Text reading with PaddleOCR (PP-OCRv5) models: a DB text detector finds text regions at any position, then a CRNN
// recogniser reads every region. Tall regions are read rotated both ways so vertical text works. The code only needs
// an onnxruntime `ort` module and RGBA pixels, so it runs in the browser and under Node.

const DETECTION_THRESHOLD = 0.3
const BOX_SCORE_THRESHOLD = 0.5
const UNCLIP_RATIO = 1.6
const MIN_BOX_SIDE = 3
const RECOGNITION_HEIGHT = 48
const MAX_RECOGNITION_WIDTH = 3200
const VERTICAL_RATIO = 1.5
const MIN_WORD_CONFIDENCE = 0.3
const DEFAULT_DETECTION_SIDE = 2400
const MAX_DETECTION_UPSCALE = 3

// Zig-zag resistor symbols and stray marks are read as "w", "mm" or punctuation.
const NOISE_WORD = /^([wWmM]{1,4}|[^\p{L}\p{N}]+)$/u

const ORIENTATIONS = { horizontal: 0, up: 90, down: 270 }

const clamp = (value, low, high) => Math.min(high, Math.max(low, value))

// Converts RGBA pixels into a normalised BGR tensor (channels first) of the requested size, using bilinear sampling of the
// source rectangle (sx, sy, sw, sh). `rotate` turns the sampled region by a quarter turn: 'cw' or 'ccw'.
export function sampleToTensor(image, region, width, height, { mean, std, rotate = null }) {
  const { data, width: imageWidth, height: imageHeight } = image
  const out = new Float32Array(3 * width * height)
  const plane = width * height
  const rotated = rotate !== null
  // Size of the region as seen after rotation; (u, v) are positions inside that view.
  const viewWidth = rotated ? region.height : region.width
  const viewHeight = rotated ? region.width : region.height
  for (let y = 0; y < height; y += 1) {
    const v = ((y + 0.5) / height) * viewHeight
    for (let x = 0; x < width; x += 1) {
      const u = ((x + 0.5) / width) * viewWidth
      let sx
      let sy
      if (rotate === 'cw') {
        sx = region.x + v
        sy = region.y + region.height - u
      } else if (rotate === 'ccw') {
        sx = region.x + region.width - v
        sy = region.y + u
      } else {
        sx = region.x + u
        sy = region.y + v
      }
      sx = clamp(sx - 0.5, 0, imageWidth - 1)
      sy = clamp(sy - 0.5, 0, imageHeight - 1)
      const x0 = Math.floor(sx)
      const y0 = Math.floor(sy)
      const x1 = Math.min(x0 + 1, imageWidth - 1)
      const y1 = Math.min(y0 + 1, imageHeight - 1)
      const fx = sx - x0
      const fy = sy - y0
      const w00 = (1 - fx) * (1 - fy)
      const w10 = fx * (1 - fy)
      const w01 = (1 - fx) * fy
      const w11 = fx * fy
      const i00 = (y0 * imageWidth + x0) * 4
      const i10 = (y0 * imageWidth + x1) * 4
      const i01 = (y1 * imageWidth + x0) * 4
      const i11 = (y1 * imageWidth + x1) * 4
      const target = y * width + x
      for (let channel = 0; channel < 3; channel += 1) {
        const value = data[i00 + 2 - channel] * w00 + data[i10 + 2 - channel] * w10 + data[i01 + 2 - channel] * w01 + data[i11 + 2 - channel] * w11
        out[channel * plane + target] = (value / 255 - mean[channel]) / std[channel]
      }
    }
  }
  return out
}

// Connected regions of the detector's probability map, as padded boxes in map coordinates.
export function findTextBoxes(map, width, height) {
  const labels = new Uint8Array(width * height)
  const stack = []
  const boxes = []
  for (let start = 0; start < map.length; start += 1) {
    if (labels[start] || map[start] <= DETECTION_THRESHOLD) continue
    let minX = width
    let minY = height
    let maxX = 0
    let maxY = 0
    let count = 0
    let total = 0
    labels[start] = 1
    stack.push(start)
    while (stack.length) {
      const index = stack.pop()
      const x = index % width
      const y = (index - x) / width
      count += 1
      total += map[index]
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (x > 0 && !labels[index - 1] && map[index - 1] > DETECTION_THRESHOLD) ((labels[index - 1] = 1), stack.push(index - 1))
      if (x < width - 1 && !labels[index + 1] && map[index + 1] > DETECTION_THRESHOLD) ((labels[index + 1] = 1), stack.push(index + 1))
      if (y > 0 && !labels[index - width] && map[index - width] > DETECTION_THRESHOLD) ((labels[index - width] = 1), stack.push(index - width))
      if (y < height - 1 && !labels[index + width] && map[index + width] > DETECTION_THRESHOLD) ((labels[index + width] = 1), stack.push(index + width))
    }
    const boxWidth = maxX - minX + 1
    const boxHeight = maxY - minY + 1
    if (Math.min(boxWidth, boxHeight) < MIN_BOX_SIDE || total / count < BOX_SCORE_THRESHOLD) continue
    // The detector predicts shrunken text kernels; DB un-clips them by area / perimeter.
    const distance = (boxWidth * boxHeight * UNCLIP_RATIO) / (2 * (boxWidth + boxHeight))
    boxes.push({ x: minX - distance, y: minY - distance, width: boxWidth + 2 * distance, height: boxHeight + 2 * distance })
  }
  return boxes
}

// CTC decoding of one recogniser output: characters with their time-step span and probability.
export function decodeCtc(output, steps, classes, characters) {
  const chars = []
  let previous = 0
  for (let step = 0; step < steps; step += 1) {
    let best = 0
    let bestValue = -Infinity
    for (let index = 0; index < classes; index += 1) {
      const value = output[step * classes + index]
      if (value > bestValue) ((bestValue = value), (best = index))
    }
    if (best !== 0 && best === previous) chars[chars.length - 1].end = step + 1
    else if (best !== 0) chars.push({ char: characters[best - 1] ?? '', start: step, end: step + 1, confidence: bestValue })
    previous = best
  }
  return chars.filter((item) => item.char)
}

// Splits decoded characters into words at spaces and at gaps clearly wider than a character.
export function splitWords(chars, gapFactor = 1.6) {
  if (!chars.length) return []
  const letters = chars.filter((item) => item.char !== ' ')
  const span = letters.length ? letters[letters.length - 1].end - letters[0].start : 0
  const advance = letters.length > 1 ? span / letters.length : 4
  const words = []
  let current = null
  chars.forEach((item) => {
    if (item.char === ' ') {
      current = null
      return
    }
    const last = current?.chars[current.chars.length - 1]
    if (!current || item.start - last.end > gapFactor * advance) {
      current = { chars: [] }
      words.push(current)
    }
    current.chars.push(item)
  })
  return words.map((word) => ({
    text: word.chars.map((item) => item.char).join(''),
    start: word.chars[0].start,
    end: word.chars[word.chars.length - 1].end,
    confidence: word.chars.reduce((sum, item) => sum + item.confidence, 0) / word.chars.length,
  }))
}

// Maps a span [start, end) of the recogniser's time axis back to a box in the original image.
export function wordBox(box, orientation, steps, start, end) {
  const from = start / steps
  const to = end / steps
  if (orientation === ORIENTATIONS.up) return { x: box.x, y: box.y + box.height * (1 - to), width: box.width, height: box.height * (to - from) }
  if (orientation === ORIENTATIONS.down) return { x: box.x, y: box.y + box.height * from, width: box.width, height: box.height * (to - from) }
  return { x: box.x + box.width * from, y: box.y, width: box.width * (to - from), height: box.height }
}

export async function createPaddleOcr({ ort, detectionModel, recognitionModel, dictionary, sessionOptions = {} }) {
  const detector = await ort.InferenceSession.create(detectionModel, sessionOptions)
  const recogniser = await ort.InferenceSession.create(recognitionModel, sessionOptions)
  const characters = dictionary.split(/\r?\n/).filter((line, index, lines) => line !== '' || index < lines.length - 1)
  characters.push(' ')

  async function detect(image, detectionSide) {
    const scale = Math.min(MAX_DETECTION_UPSCALE, detectionSide / Math.max(image.width, image.height))
    const width = Math.max(32, Math.round((image.width * scale) / 32) * 32)
    const height = Math.max(32, Math.round((image.height * scale) / 32) * 32)
    const input = sampleToTensor(image, { x: 0, y: 0, width: image.width, height: image.height }, width, height, {
      mean: [0.485, 0.456, 0.406],
      std: [0.229, 0.224, 0.225],
    })
    const result = await detector.run({ [detector.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, height, width]) })
    const map = result[detector.outputNames[0]].data
    return findTextBoxes(map, width, height).map((box) => ({
      x: (box.x / width) * image.width,
      y: (box.y / height) * image.height,
      width: (box.width / width) * image.width,
      height: (box.height / height) * image.height,
    }))
  }

  async function recognise(image, box, rotate) {
    const rotated = rotate !== null
    const ratio = (rotated ? box.height : box.width) / (rotated ? box.width : box.height)
    const width = clamp(Math.ceil(RECOGNITION_HEIGHT * ratio), 16, MAX_RECOGNITION_WIDTH)
    const input = sampleToTensor(image, box, width, RECOGNITION_HEIGHT, { mean: [0.5, 0.5, 0.5], std: [0.5, 0.5, 0.5], rotate })
    const result = await recogniser.run({ [recogniser.inputNames[0]]: new ort.Tensor('float32', input, [1, 3, RECOGNITION_HEIGHT, width]) })
    const output = result[recogniser.outputNames[0]]
    const [, steps, classes] = output.dims
    const chars = decodeCtc(output.data, steps, classes, characters)
    const confidence = chars.length ? chars.reduce((sum, item) => sum + item.confidence, 0) / chars.length : 0
    return { chars, steps, confidence }
  }

  async function readBox(image, box, horizontalOnly) {
    const clipped = {
      x: clamp(box.x, 0, image.width - 1),
      y: clamp(box.y, 0, image.height - 1),
    }
    clipped.width = clamp(box.width, 1, image.width - clipped.x)
    clipped.height = clamp(box.height, 1, image.height - clipped.y)
    if (clipped.height > VERTICAL_RATIO * clipped.width && horizontalOnly) return null
    if (clipped.height <= VERTICAL_RATIO * clipped.width) return { box: clipped, orientation: ORIENTATIONS.horizontal, ...(await recognise(image, clipped, null)) }
    const up = { orientation: ORIENTATIONS.up, ...(await recognise(image, clipped, 'cw')) }
    const down = { orientation: ORIENTATIONS.down, ...(await recognise(image, clipped, 'ccw')) }
    return { box: clipped, ...(up.confidence >= down.confidence ? up : down) }
  }

  return {
    // Words as {text, x, y, width, height, confidence (0-100), orientation, line}, in the pixels of `image`.
    async recognize(image, { detectionSide = DEFAULT_DETECTION_SIDE, horizontalOnly = false } = {}) {
      const boxes = await detect(image, detectionSide)
      const words = []
      for (const [line, box] of boxes.entries()) {
        const read = await readBox(image, box, horizontalOnly)
        if (!read) continue
        splitWords(read.chars).forEach((word) => {
          if (word.confidence < MIN_WORD_CONFIDENCE || NOISE_WORD.test(word.text)) return
          words.push({
            block: 0,
            paragraph: 0,
            line,
            ...wordBox(read.box, read.orientation, read.steps, word.start, word.end),
            confidence: word.confidence * 100,
            text: word.text,
            orientation: read.orientation,
          })
        })
      }
      return words
    },
    async terminate() {
      await Promise.all([detector.release?.(), recogniser.release?.()])
    },
  }
}
