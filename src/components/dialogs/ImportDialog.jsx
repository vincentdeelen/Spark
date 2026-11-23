import { useEffect, useRef, useState } from 'react'
import { importDocument, MAX_IMPORT_PAGES, openImportFile } from '../../importing/documentImport.js'
import '../../styles/buttons.css'
import '../../styles/dialog.css'
import './ImportDialog.css'

const range = (count) => Array.from({ length: count }, (_, index) => index + 1)

function PageSelector({ pdf, pages, busy, onChange }) {
  const selectable = Math.min(pdf.numPages, MAX_IMPORT_PAGES)
  return (
    <fieldset className="import-pages">
      <legend>PDF pages (up to {MAX_IMPORT_PAGES} at a time)</legend>
      <button type="button" disabled={busy} onClick={() => onChange(range(selectable))}>
        {pdf.numPages > MAX_IMPORT_PAGES ? `Select first ${MAX_IMPORT_PAGES}` : 'Select all'}
      </button>
      <button type="button" disabled={busy} onClick={() => onChange([])}>
        Clear
      </button>
      <div className="page-list">
        {range(pdf.numPages).map((page) => (
          <label key={page}>
            <input
              type="checkbox"
              checked={pages.includes(page)}
              disabled={busy}
              onChange={(event) => onChange(event.target.checked ? [...pages, page] : pages.filter((item) => item !== page))}
            />{' '}
            Page {page}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function ImportDestination({ newProject, busy, onChange }) {
  return (
    <fieldset className="import-destination">
      <legend>Add the circuits to</legend>
      <label>
        <input type="radio" name="import-destination" checked={!newProject} onChange={() => onChange(false)} disabled={busy} /> This project
      </label>
      <label>
        <input type="radio" name="import-destination" checked={newProject} onChange={() => onChange(true)} disabled={busy} /> A new project (replaces the current circuits and BOM)
      </label>
    </fieldset>
  )
}

function ImportOptions({ source, busy, detect, searchBom, forceOcr, onDetectChange, onSearchBomChange, onForceOcrChange }) {
  return (
    <div className="import-explanation">
      <label>
        <input type="checkbox" checked={detect} onChange={(event) => onDetectChange(event.target.checked)} disabled={busy} /> Detect straight wires (experimental)
      </label>
      <p>
        Detection can miss wires or mistake symbols and text for wires. Local wire examples can adjust detection. Review every wire. After importing, use Teach &amp; review to mark
        parts and find similar symbols; labels and connectivity are not inferred.
      </p>
      <label>
        <input type="checkbox" checked={searchBom} onChange={(event) => onSearchBomChange(event.target.checked)} disabled={busy} /> Search for a bill of materials
      </label>
      <p>Only selected PDF pages are searched. Image-based pages use local OCR, which may take time. Possible tables need review; detection can miss tables.</p>
      {source.kind === 'pdf' && searchBom && (
        <label>
          <input type="checkbox" checked={forceOcr} onChange={(event) => onForceOcrChange(event.target.checked)} disabled={busy} /> Also use OCR on pages with a detected text table
        </label>
      )}
    </div>
  )
}

export default function ImportDialog({ onClose, onImport, onImportProject }) {
  const [source, setSource] = useState(null)
  const [pages, setPages] = useState([])
  const [detect, setDetect] = useState(true)
  const [searchBom, setSearchBom] = useState(true)
  const [forceOcr, setForceOcr] = useState(false)
  const [newProject, setNewProject] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const pdfRef = useRef(null)

  useEffect(
    () => () => {
      pdfRef.current?.destroy()
    },
    [],
  )

  const chooseFile = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true)
    setError('')
    setProgress('')
    setSource(null)
    setPages([])
    try {
      await pdfRef.current?.destroy()
      pdfRef.current = null
      const opened = await openImportFile(file)
      if (opened.kind === 'pdf') {
        pdfRef.current = opened.pdf
        setPages(range(Math.min(opened.pdf.numPages, MAX_IMPORT_PAGES)))
      }
      setSource(opened)
    } catch (reason) {
      setError(reason.message || 'The file could not be opened.')
    } finally {
      setBusy(false)
    }
  }

  const importFile = async () => {
    if (!source) return
    if (source.kind === 'pdf' && !pages.length) {
      setError('Select at least one PDF page.')
      return
    }
    if (source.kind === 'pdf' && pages.length > MAX_IMPORT_PAGES) {
      setError(`Select at most ${MAX_IMPORT_PAGES} pages at a time. You can import the remaining pages separately.`)
      return
    }
    setBusy(true)
    setError('')
    setProgress('')
    try {
      const destination = { newProject, projectName: source.name.replace(/\.[^.]+$/, '') }
      if (source.kind === 'project') onImportProject(source.project, destination)
      else if (source.kind === 'spark') onImport([{ name: source.name, diagram: source.diagram }], false, [], false, destination)
      else {
        const { results, candidates } = await importDocument({ source, pages, detect, searchBom, forceOcr, onProgress: setProgress })
        onImport(
          results.map(({ name, diagram }) => ({ name, diagram })),
          results.some((result) => result.truncated),
          candidates,
          searchBom,
          destination,
        )
      }
    } catch (reason) {
      setError(reason.message || 'The file could not be imported.')
    } finally {
      setBusy(false)
      setProgress('')
    }
  }

  const needsOptions = source && source.kind !== 'spark' && source.kind !== 'project'

  return (
    <div className="dialog-backdrop">
      <section className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title">
        <h2 id="import-title">Import circuit</h2>
        <p>Choose a Live Wire project (.spark), PDF, PNG, or SVG. Files are processed locally and added to the workspace.</p>
        <label className="import-file">
          Choose file <input type="file" accept=".spark,.pdf,.png,.svg,application/pdf,image/png,image/svg+xml" onChange={chooseFile} disabled={busy} />
        </label>
        {source?.kind === 'pdf' && <PageSelector pdf={source.pdf} pages={pages} busy={busy} onChange={setPages} />}
        {source?.kind === 'pdf' && (
          <p className="import-explanation">
            {pages.length > 1
              ? `Each of the ${pages.length} selected pages becomes its own circuit, so they can be edited, matched to the BOM and saved together as one project.`
              : 'The selected page becomes one circuit.'}
          </p>
        )}
        {source && <ImportDestination newProject={newProject} busy={busy} onChange={setNewProject} />}
        {needsOptions && (
          <ImportOptions
            source={source}
            busy={busy}
            detect={detect}
            searchBom={searchBom}
            forceOcr={forceOcr}
            onDetectChange={setDetect}
            onSearchBomChange={setSearchBom}
            onForceOcrChange={setForceOcr}
          />
        )}
        {source?.kind === 'spark' && <p className="import-explanation">Editable circuit metadata found. Components and wires will be restored as editable elements.</p>}
        {source?.kind === 'project' && <p className="import-explanation">Live Wire project found. Its circuits and linked section views will be added to this workspace.</p>}
        {error && (
          <p className="import-error" role="alert">
            {error}
          </p>
        )}
        {progress && <p role="status">{progress}</p>}
        <div className="import-actions">
          <button type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="export-button" onClick={importFile} disabled={busy || !source}>
            {busy ? 'Processing…' : 'Import'}
          </button>
        </div>
      </section>
    </div>
  )
}
