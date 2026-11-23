import { detectStraightWires } from './wireDetection.js'
import { makeId } from '../shared/ids.js'
import { MAX_IMAGE_PIXELS } from '../shared/limits.js'

const WIDTH = 1000
const HEIGHT = 700
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

// Throws unless the first 24 bytes are a PNG header with sane dimensions.
export async function assertPngDimensions(file) {
  const bytes = new Uint8Array(await file.slice(0, 24).arrayBuffer())
  if (bytes.length < 24 || !PNG_SIGNATURE.every((value, index) => bytes[index] === value)) throw new Error('This is not a valid PNG file.')
  const header = new DataView(bytes.buffer)
  const width = header.getUint32(16)
  const height = header.getUint32(20)
  if (!width || !height || width * height > MAX_IMAGE_PIXELS) throw new Error('PNG dimensions exceed 50 megapixels or are invalid.')
}

export async function loadImage(blob) {
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > MAX_IMAGE_PIXELS) {
      throw new Error('The image dimensions are invalid or exceed 50 megapixels.')
    }
    return image
  } finally {
    URL.revokeObjectURL(url)
  }
}

// A white canvas covering the editor's 1000×700 space at the given pixel scale.
export function createCanvas(scale = 1) {
  const canvas = document.createElement('canvas')
  canvas.width = WIDTH * scale
  canvas.height = HEIGHT * scale
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('Could not create an image canvas.')
  context.fillStyle = 'white'
  context.fillRect(0, 0, canvas.width, canvas.height)
  return { canvas, context }
}

// Draws the image centred and scaled to fit inside the canvas margins.
export function drawImageFitted(context, image) {
  const { width: canvasWidth, height: canvasHeight } = context.canvas
  const scale = Math.min((canvasWidth * 0.92) / image.naturalWidth, (canvasHeight * (620 / 700)) / image.naturalHeight)
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  context.drawImage(image, (canvasWidth - width) / 2, (canvasHeight - height) / 2, width, height)
}

// The image at its natural size on a white background, for OCR.
export function imageToOcrCanvas(image) {
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create an image canvas for BOM OCR.')
  context.fillStyle = 'white'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, 0, 0)
  return canvas
}

// Builds a diagram holding the canvas as reference image, optionally with detected straight wires.
export function diagramFromCanvas(canvas, context, detect, settings) {
  let detectionContext = context
  if (detect && canvas.width !== WIDTH) {
    detectionContext = createCanvas().context
    detectionContext.drawImage(canvas, 0, 0, WIDTH, HEIGHT)
  }
  const result = detect ? detectStraightWires(detectionContext.getImageData(0, 0, WIDTH, HEIGHT), makeId, settings) : { wires: [], truncated: false }
  return { diagram: { components: [], wires: result.wires, reference: { dataUrl: canvas.toDataURL('image/png') } }, truncated: result.truncated }
}
