import { useState } from 'react'
import { appendBom, bomToRows, namedCircuits, rowsToBom } from '../../bom/bom.js'
import { readBomFile, saveBomCsv, saveBomXlsx } from '../../bom/bomFiles.js'
import { rowsToEditableCsv } from '../../bom/bomExtraction.js'
import { fileBaseName } from '../../project/download.js'
import useCsvTable from '../../hooks/useCsvTable.js'
import BomTable from './BomTable.jsx'
import DetectedTables from './DetectedTables.jsx'
import '../../styles/buttons.css'
import '../../styles/dialog.css'
import './BomDialog.css'

export default function BomDialog({ circuits, bom, onClose, onReplace, onGenerate, projectName, activeCircuitId, candidates = [], onConsumeCandidate }) {
  const projectBomText = () => (bom.length ? rowsToEditableCsv(bomToRows(bom, circuits)) : '')
  const [candidateId, setCandidateId] = useState(() => candidates[0]?.id || '')
  const table = useCsvTable(candidates[0]?.csv || projectBomText())
  const [circuitId, setCircuitId] = useState(() => (candidates.length ? '' : activeCircuitId))
  const [mergeCandidate, setMergeCandidate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [forceOcr, setForceOcr] = useState(false)
  const [workbook, setWorkbook] = useState([])
  const [worksheet, setWorksheet] = useState('')
  const [pdfTables, setPdfTables] = useState([])
  const [pdfTableIndex, setPdfTableIndex] = useState(0)
  const [editCsv, setEditCsv] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const baseName = fileBaseName(projectName)

  const showCandidate = (candidate) => {
    table.setText(candidate ? candidate.csv : projectBomText())
    setCandidateId(candidate?.id || '')
    setCircuitId(candidate ? '' : activeCircuitId)
    setError('')
  }

  const selectCandidate = (id) => {
    if (table.text.trim() && !window.confirm('Replace the current table preview?')) return
    showCandidate(candidates.find((candidate) => candidate.id === id))
  }

  const dismissCandidate = () => {
    if (!window.confirm('Dismiss this detected table and its preview?')) return
    const next = candidates.find((candidate) => candidate.id !== candidateId)
    onConsumeCandidate(candidateId)
    showCandidate(next)
  }

  const chooseFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError('')
    setMessage('')
    setWorkbook([])
    setWorksheet('')
    setPdfTables([])
    setPdfTableIndex(0)
    try {
      const result = await readBomFile(file, { forceOcr, onProgress: setMessage })
      setWorkbook(result.workbook)
      setWorksheet(result.workbook[0]?.sheet || '')
      setPdfTables(result.tables)
      table.setText(result.text)
      setCandidateId('')
      setMessage(result.message)
    } catch (reason) {
      setError(reason.message || 'Could not read the BOM.')
    } finally {
      setBusy(false)
    }
  }

  const chooseWorksheet = (name) => {
    setWorksheet(name)
    table.setRows(workbook.find((sheet) => sheet.sheet === name).data)
  }

  const choosePdfTable = (index) => {
    if (table.text.trim() && !window.confirm('Replace the current table preview?')) return
    setPdfTableIndex(index)
    table.setRows(pdfTables[index].rows)
    setError('')
  }

  const importBom = () => {
    try {
      if (table.error) throw new Error(table.error)
      const rows = rowsToBom(table.rows, circuits, circuitId)
      const affected = new Set(rows.map((item) => item.documentId))
      const merging = candidateId && mergeCandidate
      const replacesExisting = !merging && bom.some((item) => affected.has(item.documentId))
      if (replacesExisting && !window.confirm('Replace BOM entries for the circuits in this table? Entries for other circuits will be kept.')) return
      onReplace(merging ? appendBom(bom, rows) : [...bom.filter((item) => !affected.has(item.documentId)), ...rows], rows)
      if (candidateId) onConsumeCandidate(candidateId)
      onClose()
    } catch (reason) {
      setError(reason.message)
    }
  }

  const generate = () => {
    if (onGenerate()) onClose()
  }

  const clear = () => {
    if (!window.confirm('Clear the project BOM? Circuit components will not be changed.')) return
    onReplace([], null)
    onClose()
  }

  const exportCsv = () => {
    try {
      saveBomCsv(table.rows, baseName)
      setError('')
    } catch (reason) {
      setError(reason.message || 'Could not export the CSV.')
    }
  }

  const exportXlsx = async () => {
    setBusy(true)
    setError('')
    try {
      await saveBomXlsx(table.rows, baseName)
    } catch (reason) {
      setError(reason.message || 'Could not export the XLSX file.')
    } finally {
      setBusy(false)
    }
  }

  const cannotExport = busy || !!table.error || !table.rows.length

  return (
    <div className="dialog-backdrop">
      <section className="import-dialog bom-dialog" role="dialog" aria-modal="true" aria-labelledby="bom-title">
        <h2 id="bom-title">Bill of materials</h2>
        <p>
          The BOM covers all circuits. Rows without a Circuit column are assigned to the selected circuit; use circuit names to distinguish repeated references such as R1.
          Importing replaces BOM entries only for circuits in the table.
        </p>
        {candidates.length > 0 && (
          <DetectedTables
            candidates={candidates}
            candidateId={candidateId}
            busy={busy}
            merge={mergeCandidate}
            onSelect={selectCandidate}
            onDismiss={dismissCandidate}
            onMergeChange={setMergeCandidate}
          />
        )}
        <p>
          {bom.length} BOM items. Generating lists the current circuit components again, keeping the descriptions and extra columns of parts already listed. Exports contain the
          table currently shown, including unimported edits.
        </p>
        <div className="bom-buttons">
          <button type="button" onClick={generate} disabled={busy}>
            Generate from circuits
          </button>
          <button type="button" onClick={exportCsv} disabled={cannotExport}>
            Export CSV
          </button>
          <button type="button" onClick={exportXlsx} disabled={cannotExport}>
            Export XLSX
          </button>
          <button type="button" disabled={busy || !bom.length} onClick={clear}>
            Clear BOM
          </button>
        </div>
        <label>
          <input type="checkbox" checked={forceOcr} onChange={(event) => setForceOcr(event.target.checked)} disabled={busy} /> Use OCR for all PDF pages (select before choosing the
          file)
        </label>
        <label className="import-file">
          Import BOM (CSV, XLSX, or PDF)
          <input type="file" accept=".csv,.xlsx,.pdf" onChange={chooseFile} disabled={busy} />
        </label>
        {workbook.length > 1 && (
          <label>
            Worksheet{' '}
            <select value={worksheet} onChange={(event) => chooseWorksheet(event.target.value)}>
              {workbook.map((sheet) => (
                <option value={sheet.sheet} key={sheet.sheet}>
                  {sheet.sheet}
                </option>
              ))}
            </select>
          </label>
        )}
        {pdfTables.length > 1 && (
          <label>
            PDF table{' '}
            <select value={pdfTableIndex} disabled={busy} onChange={(event) => choosePdfTable(Number(event.target.value))}>
              {pdfTables.map((item, index) => (
                <option value={index} key={item.name}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Default circuit{' '}
          <select value={circuitId} onChange={(event) => setCircuitId(event.target.value)}>
            <option value="">Choose a circuit</option>
            {namedCircuits(circuits).map((item) => (
              <option value={item.id} key={item.id}>
                {item.bomName}
              </option>
            ))}
          </select>
        </label>
        <p>Review and correct the table, especially OCR results. A Reference column is required for importing; multiple references can be separated by commas.</p>
        <div className="bom-buttons">
          <button type="button" disabled={busy} onClick={() => setEditCsv(!editCsv)}>
            {editCsv ? 'Edit as table' : 'Edit as CSV'}
          </button>
          {!table.rows.length && !table.error && (
            <button type="button" disabled={busy} onClick={() => table.setRows([['Reference', 'Value', 'Description']])}>
              New table
            </button>
          )}
          {!!table.rows.length && !table.error && (
            <>
              <button type="button" disabled={busy} onClick={table.addRow}>
                Add row
              </button>
              <button type="button" disabled={busy} onClick={table.addColumn}>
                Add column
              </button>
            </>
          )}
        </div>
        {(editCsv || table.error) && (
          <label className="bom-editor">
            CSV text
            <textarea value={table.text} onChange={(event) => table.setText(event.target.value)} rows={10} disabled={busy} />
          </label>
        )}
        {table.error && (
          <p className="import-error" role="alert">
            {table.error} Correct the CSV text before editing or exporting the table.
          </p>
        )}
        {!editCsv && !table.error && !!table.rows.length && (
          <BomTable rows={table.rows} columnCount={table.columnCount} disabled={busy} onCellChange={table.setCell} onRemoveRow={table.removeRow} />
        )}
        {message && <p role="status">{message}</p>}
        {error && (
          <p className="import-error" role="alert">
            {error}
          </p>
        )}
        <div className="import-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Close
          </button>
          <button type="button" className="export-button" onClick={importBom} disabled={busy || !table.text.trim()}>
            {busy ? 'Processing…' : 'Import BOM'}
          </button>
        </div>
      </section>
    </div>
  )
}
