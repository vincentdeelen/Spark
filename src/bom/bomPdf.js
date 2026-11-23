import { findBomTables, newTables, wordsToRows } from './bomExtraction.js'
import { loadPdf, pageTextWords, renderPageForOcr } from '../importing/pdf.js'

const MAX_PAGES = 25

// Reads every page of a PDF. Returns the tables detected on any page plus the raw
// text rows, which serve as a fallback when no table is recognised.
export async function extractBomFromPdf(file, { forceOcr = false, onProgress = () => {} } = {}) {
  const pdf = await loadPdf(await file.arrayBuffer())
  let ocr
  const rows = []
  const tables = []
  try {
    if (pdf.numPages > MAX_PAGES) throw new Error(`BOM PDFs are limited to ${MAX_PAGES} pages.`)
    for (let number = 1; number <= pdf.numPages; number += 1) {
      onProgress(`Reading page ${number} of ${pdf.numPages}…`)
      const page = await pdf.getPage(number)
      let words = await pageTextWords(page)
      let found = findBomTables(words)
      if (forceOcr || !found.length) {
        const { createLocalOcr, recognizeWords } = await import('../importing/ocr.js')
        ocr ||= await createLocalOcr()
        words = await recognizeWords(ocr, await renderPageForOcr(page), { horizontalOnly: true })
        found = [...found, ...newTables(found, findBomTables(words))]
      }
      found.forEach((table, index) => tables.push({ name: `Page ${number} · table ${index + 1}`, rows: table }))
      const pageRows = wordsToRows(words)
      const repeatsHeader = rows.length && pageRows.length && pageRows[0].join('\u0000').toLowerCase() === rows[0].join('\u0000').toLowerCase()
      if (repeatsHeader) pageRows.shift()
      rows.push(...pageRows)
      page.cleanup()
    }
    return { rows, tables }
  } finally {
    if (ocr) await ocr.terminate()
    await pdf.destroy()
  }
}
