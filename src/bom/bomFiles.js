import { spreadsheetCsv } from './bom.js'
import { extractBomFromPdf } from './bomPdf.js'
import { rowsToEditableCsv } from './bomExtraction.js'
import { downloadBlob } from '../project/download.js'
import { MAX_FILE_BYTES } from '../shared/limits.js'

const REVIEW_NOTICE = 'Review and correct the extracted table before importing. PDF and OCR extraction can be inaccurate.'
const NO_TABLE_NOTICE = 'No BOM table was detected. Raw extracted text is shown for manual correction.'

// Reads a CSV, XLSX, or PDF BOM into editable CSV text.
// Returns { text, message, workbook, tables } where workbook/tables list alternative sheets or detected PDF tables.
export async function readBomFile(file, { forceOcr = false, onProgress } = {}) {
  if (file.size > MAX_FILE_BYTES) throw new Error('Files must be 30 MB or smaller.')
  const extension = file.name.split('.').pop().toLowerCase()
  if (extension === 'csv') return { text: await file.text(), message: '', workbook: [], tables: [] }
  if (extension === 'xlsx') {
    const { default: readExcelFile } = await import('read-excel-file/browser')
    const sheets = await readExcelFile(file)
    if (!sheets.length) throw new Error('The workbook contains no worksheets.')
    return { text: rowsToEditableCsv(sheets[0].data), message: REVIEW_NOTICE, workbook: sheets, tables: [] }
  }
  if (extension === 'pdf') {
    const { rows, tables } = await extractBomFromPdf(file, { forceOcr, onProgress })
    return { text: rowsToEditableCsv(tables[0]?.rows || rows), message: tables.length ? REVIEW_NOTICE : NO_TABLE_NOTICE, workbook: [], tables }
  }
  throw new Error('Choose a CSV, XLSX, or PDF BOM.')
}

export function saveBomCsv(rows, baseName) {
  downloadBlob(new Blob([spreadsheetCsv(rows)], { type: 'text/csv;charset=utf-8' }), `${baseName}-bom.csv`)
}

export async function saveBomXlsx(rows, baseName) {
  const { default: writeExcelFile } = await import('write-excel-file/browser')
  // Cells are written as strings so spreadsheet applications never evaluate them as formulas.
  await writeExcelFile(rows.map((row) => row.map(String))).toFile(`${baseName}-bom.xlsx`)
}
