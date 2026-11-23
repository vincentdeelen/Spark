import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { MAX_IMAGE_PIXELS } from '../shared/limits.js'

export async function loadPdf(data, options = {}) {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  return pdfjs.getDocument({ data, isEvalSupported: false, ...options }).promise
}

// Words from the PDF text layer, in the same shape the OCR produces.
export async function pageTextWords(page) {
  const content = await page.getTextContent()
  return content.items
    .filter((item) => item.str?.trim())
    .map((item) => ({ text: item.str.trim(), x: item.transform[4], y: -item.transform[5], width: item.width, height: item.height || 10 }))
}

export async function renderPageForOcr(page, scale = 3) {
  const viewport = page.getViewport({ scale })
  const width = Math.ceil(viewport.width)
  const height = Math.ceil(viewport.height)
  if (width * height > MAX_IMAGE_PIXELS) throw new Error('The PDF page exceeds 50 megapixels for BOM OCR.')
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not create an image canvas for BOM OCR.')
  // The print intent avoids requestAnimationFrame, which stalls in hidden tabs.
  await page.render({ canvasContext: context, viewport, intent: 'print' }).promise
  return canvas
}
