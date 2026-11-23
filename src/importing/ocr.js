// Local text recognition for schematics and BOM scans. The PP-OCRv5 models and the onnxruntime WebAssembly runtime are
// served from /ocr/, so no image ever leaves the browser.
const MAX_IMAGE_SIDE = 12000

const assetUrl = () => new URL(`${import.meta.env.BASE_URL}ocr/`, location.origin).href

const fetchBuffer = async (name) => {
  const response = await fetch(`${assetUrl()}${name}`)
  if (!response.ok) throw new Error(`Could not load the OCR model ${name}.`)
  return new Uint8Array(await response.arrayBuffer())
}

export async function createLocalOcr() {
  const base = assetUrl()
  const [{ createPaddleOcr }, ort, detectionModel, recognitionModel, dictionary] = await Promise.all([
    import('./paddleOcr.js'),
    import('onnxruntime-web/wasm'),
    fetchBuffer('det.onnx'),
    fetchBuffer('rec.onnx'),
    fetch(`${base}dict.txt`).then((response) => response.text()),
  ])
  ort.env.wasm.wasmPaths = { mjs: `${base}ort-wasm-simd-threaded.mjs`, wasm: `${base}ort-wasm-simd-threaded.wasm` }
  // Running the model in a worker keeps the page responsive; threads need cross-origin isolation.
  ort.env.wasm.proxy = true
  ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1
  return createPaddleOcr({ ort, detectionModel, recognitionModel, dictionary, sessionOptions: { executionProviders: ['wasm'], graphOptimizationLevel: 'all' } })
}

const loadImage = (source) =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not load the image for text recognition.'))
    image.src = source
  })

// Pixels (RGBA, on a white background) of a data URL, image element, or canvas.
async function readPixels(image) {
  const source = typeof image === 'string' ? await loadImage(image) : image
  const width = source.naturalWidth || source.width
  const height = source.naturalHeight || source.height
  if (Math.max(width, height) > MAX_IMAGE_SIDE) throw new Error('The image is too large for text recognition.')
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  context.fillStyle = '#fff'
  context.fillRect(0, 0, width, height)
  context.drawImage(source, 0, 0)
  return context.getImageData(0, 0, width, height)
}

// Words with their position in the image's pixels. Text written vertically is read too and is tagged with an `orientation` of
// 90 (reading upwards) or 270 (reading downwards); horizontal words have 0. Pass `horizontalOnly` to skip vertical text.
export async function recognizeWords(engine, image, options) {
  return engine.recognize(await readPixels(image), options)
}
