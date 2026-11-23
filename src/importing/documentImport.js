import { findBomTables, newTables, rowsToEditableCsv } from '../bom/bomExtraction.js'
import { makeId } from '../shared/ids.js'
import { assertPngDimensions, createCanvas, diagramFromCanvas, drawImageFitted, imageToOcrCanvas, loadImage } from './importRaster.js'
import { MAX_FILE_BYTES } from '../shared/limits.js'
import { loadPdf, pageTextWords, renderPageForOcr } from './pdf.js'
import { readProject } from '../project/project.js'
import { readSvg } from './svgImport.js'
import { readTraining, wireSettings } from './training.js'

export const MAX_PDF_PAGES = 1000
export const MAX_IMPORT_PAGES = 25

// Opens a file chosen in the import dialog. Returns a source describing what it is:
// project (.spark), spark (editable SVG), svg/png (image to trace) or pdf (pages to choose from).
export async function openImportFile(file) {
  if (file.size > MAX_FILE_BYTES) throw new Error('Files must be 30 MB or smaller.')
  const extension = file.name.split('.').pop().toLowerCase()
  if (extension === 'spark') return { name: file.name, kind: 'project', project: readProject(await file.text()) }
  if (extension === 'pdf') {
    const pdf = await loadPdf(await file.arrayBuffer(), { useSystemFonts: true })
    if (pdf.numPages > MAX_PDF_PAGES) {
      await pdf.destroy()
      throw new Error('PDFs with more than 1,000 pages are not supported.')
    }
    return { name: file.name, kind: 'pdf', pdf }
  }
  if (extension === 'svg') {
    const parsed = readSvg(await file.text())
    return { name: file.name, kind: parsed.diagram ? 'spark' : 'svg', ...parsed }
  }
  if (extension === 'png') {
    await assertPngDimensions(file)
    return { name: file.name, kind: 'png', blob: file }
  }
  throw new Error('Choose a Live Wire project, PDF, PNG, or SVG file.')
}

// Loads the OCR engine on first use so imports without a BOM search never download it.
function createBomScanner(onProgress) {
  let ocr
  let recognizeWords
  return {
    async scan(name, getCanvas) {
      onProgress(`Searching ${name} for a BOM with local OCR…`)
      if (!ocr) {
        const module = await import('./ocr.js')
        ocr = await module.createLocalOcr()
        recognizeWords = module.recognizeWords
      }
      return findBomTables(await recognizeWords(ocr, await getCanvas(), { horizontalOnly: true }))
    },
    async close() {
      if (ocr) await ocr.terminate()
    },
  }
}

function toCandidates(name, tables) {
  return tables.map((rows, index) => ({ id: makeId(), name: `${name} · table ${index + 1}`, csv: rowsToEditableCsv(rows) }))
}

async function importPdfPage({ pdf, name, number, detect, settings, searchBom, forceOcr, scanner, onProgress }) {
  const page = await pdf.getPage(number)
  const pageName = `${name} · page ${number}`
  try {
    onProgress(`Importing page ${number}…`)
    const original = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: Math.min(1840 / original.width, 1240 / original.height) })
    const { canvas, context } = createCanvas(2)
    const centre = [(canvas.width - viewport.width) / 2, (canvas.height - viewport.height) / 2]
    await page.render({ canvasContext: context, viewport, intent: 'print', transform: [1, 0, 0, 1, ...centre] }).promise
    const result = { name: pageName, ...diagramFromCanvas(canvas, context, detect, settings) }
    let candidates = []
    if (searchBom) {
      const tables = findBomTables(await pageTextWords(page))
      candidates = toCandidates(pageName, tables)
      if (!tables.length || forceOcr) {
        const scanned = await scanner.scan(pageName, () => renderPageForOcr(page))
        candidates.push(...toCandidates(`${pageName} (OCR)`, newTables(tables, scanned)))
      }
    }
    return { result, candidates }
  } finally {
    page.cleanup()
  }
}

async function importImage({ source, detect, settings, searchBom, scanner }) {
  const image = await loadImage(source.blob)
  const { canvas, context } = createCanvas(2)
  drawImageFitted(context, image)
  const result = { name: source.name, ...diagramFromCanvas(canvas, context, detect, settings) }
  const candidates = searchBom ? toCandidates(source.name, await scanner.scan(source.name, () => imageToOcrCanvas(image))) : []
  return { result, candidates }
}

// Converts the chosen PDF pages or the image into diagrams, plus any BOM tables found alongside them.
export async function importDocument({ source, pages, detect, searchBom, forceOcr, onProgress }) {
  const settings = detect ? wireSettings(readTraining()) : {}
  const scanner = createBomScanner(onProgress)
  const results = []
  const candidates = []
  const collect = (imported) => {
    results.push(imported.result)
    candidates.push(...imported.candidates)
  }
  try {
    if (source.kind === 'pdf') {
      for (const number of [...pages].sort((a, b) => a - b)) {
        collect(await importPdfPage({ pdf: source.pdf, name: source.name, number, detect, settings, searchBom, forceOcr, scanner, onProgress }))
      }
    } else {
      collect(await importImage({ source, detect, settings, searchBom, scanner }))
    }
  } finally {
    await scanner.close()
  }
  return { results, candidates }
}
