import { createRef, useState } from 'react'
import { initialDiagram } from './circuit/initialDiagram.js'
import { assertUniqueMatchedReferences, generateBom, isBuiltInColumn } from './bom/bom.js'
import { addMissingToBom, planUniqueReferences, updateBomItem, withRenames, withoutBomItems } from './bom/bomSync.js'
import { findLibraryItem } from './circuit/library.js'
import useNotice from './hooks/useNotice.js'
import useProjectFiles from './hooks/useProjectFiles.js'
import { makeId } from './shared/ids.js'
import { DEFAULT_PROJECT_NAME, remapProjectIds, serializeProject } from './project/project.js'
import { canWriteFiles } from './project/projectFile.js'
import { duplicateView, insertViewAfter, moveView, removeView, renameView } from './project/sheetOps.js'
import { labelViews } from './project/views.js'
import BomSheet from './components/bom/BomSheet.jsx'
import BomDialog from './components/dialogs/BomDialog.jsx'
import ImportDialog from './components/dialogs/ImportDialog.jsx'
import NameDialog from './components/dialogs/NameDialog.jsx'
import TestCircuitDialog from './components/dialogs/TestCircuitDialog.jsx'
import SheetBar from './components/layout/SheetBar.jsx'
import SheetEditor from './components/editor/SheetEditor.jsx'
import TopBar from './components/layout/TopBar.jsx'
import './App.css'

const INITIAL_SHEET_ID = 'initial-sheet'

// A sheet is one circuit; `editorRef` lets the app read and control its editor without lifting its state.
const createSheet = (item) => ({ ...item, editorRef: createRef() })
const EMPTY_DIAGRAM = { components: [], wires: [] }

function importNotice({ count, truncated, searchedBom, foundBom }) {
  const imported = count > 1 ? `Imported ${count} circuits. ` : ''
  if (truncated) return `${imported || 'Imported. '}Wire detection reached its limit; review and trace missing wires.`
  if (searchedBom && !foundBom) return `${imported}Import complete. No BOM detected; tables may have been missed.`
  return `${imported}Import complete. Review detected wires and trace missing parts.`
}

function App() {
  const [projectName, setProjectName] = useState(DEFAULT_PROJECT_NAME)
  const [sheets, setSheets] = useState(() => [createSheet({ id: INITIAL_SHEET_ID, name: 'Sheet 1', diagram: initialDiagram })])
  const [views, setViews] = useState(() => [{ id: INITIAL_SHEET_ID, documentId: INITIAL_SHEET_ID, name: 'Sheet 1', region: null }])
  const [activeId, setActiveId] = useState(null)
  // The bill of materials is a tab of its own; the circuit that was active stays selected underneath.
  const [bomShown, setBomShown] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [bomOpen, setBomOpen] = useState(false)
  const [testOpen, setTestOpen] = useState(false)
  // The file this project was opened from or last saved to, when the browser can write files directly.
  const [fileHandle, setFileHandle] = useState(null)
  const [bom, setBom] = useState([])
  const [bomCandidates, setBomCandidates] = useState([])
  const [notice, showNotice] = useNotice()
  const activate = (id) => {
    setBomShown(false)
    setActiveId(id)
  }
  const activeView = views.find((item) => item.id === activeId) || views[0]
  const activeSheet = sheets.find((sheet) => sheet.id === activeView.documentId)

  // True while the workspace is still the untouched starter circuit, which an import then replaces instead of sitting beside.
  const isStarterProject = () => {
    const [only] = sheets
    return (
      sheets.length === 1 &&
      views.length === 1 &&
      !bom.length &&
      only.id === INITIAL_SHEET_ID &&
      JSON.stringify(only.editorRef.current?.getDiagram()) === JSON.stringify(initialDiagram)
    )
  }

  // Empties the workspace so the circuits added next form a project of their own.
  const resetProject = (name) => {
    setSheets([])
    setViews([])
    setBom([])
    setBomCandidates([])
    setProjectName(name)
    setFileHandle(null)
    setBomShown(false)
  }

  // An import starts a new project when asked to, or when it would otherwise land next to the untouched starter circuit.
  // Returns false when the user declines to replace the current project.
  const prepareImport = ({ newProject = false, projectName: name } = {}) => {
    const starter = isStarterProject()
    if (!newProject && !starter) return true
    if (newProject && !starter && !window.confirm('Replace all current circuits and the BOM with this import? Unsaved work will be lost.')) return false
    resetProject(newProject || projectName === DEFAULT_PROJECT_NAME ? name || projectName : projectName)
    return true
  }

  const addSheets = (newSheets, newViews) => {
    setSheets((current) => [...current, ...newSheets])
    setViews((current) => [...current, ...newViews])
  }

  const importSheets = (items, truncated, candidates = [], searchedBom = false, options = {}) => {
    if (!prepareImport(options)) return
    const newSheets = items.map((item) => createSheet({ ...item, id: makeId() }))
    addSheets(
      newSheets,
      newSheets.map((sheet) => ({ id: sheet.id, documentId: sheet.id, name: sheet.name, region: sheet.diagram.viewRegion || null })),
    )
    activate(newSheets[0].id)
    setImportOpen(false)
    if (candidates.length) {
      setBomCandidates((current) => [...candidates, ...current])
      setBomOpen(true)
    }
    showNotice(importNotice({ count: newSheets.length, truncated, searchedBom, foundBom: candidates.length > 0 }))
  }

  const importProject = (project, options = {}) => {
    if (!prepareImport(options)) return
    const imported = remapProjectIds(project, makeId)
    addSheets(imported.documents.map(createSheet), imported.views)
    if (imported.bom) setBom((current) => [...current, ...imported.bom])
    activate(imported.activeViewId)
    setImportOpen(false)
    showNotice('Project imported. Linked views share edits with their original circuits.')
  }

  const projectData = () =>
    serializeProject({
      documents: sheets.map((sheet) => ({ id: sheet.id, name: sheet.name, diagram: sheet.editorRef.current?.getDiagram() || sheet.diagram })),
      views,
      activeViewId: activeView.id,
      bom,
    })

  const loadProject = (project, name, handle = null) => {
    const loaded = remapProjectIds(project, makeId)
    resetProject(name)
    setFileHandle(handle)
    addSheets(loaded.documents.map(createSheet), loaded.views)
    if (loaded.bom) setBom(loaded.bom)
    activate(loaded.activeViewId)
    setBomOpen(false)
  }

  const files = useProjectFiles({ projectName, setProjectName, fileHandle, setFileHandle, getProjectData: projectData, isStarterProject, loadProject, showNotice })

  const newProject = async () => {
    if (!(await files.leaveProject())) return
    resetProject(DEFAULT_PROJECT_NAME)
    startCircuit('Circuit 1', EMPTY_DIAGRAM)
    setBomOpen(false)
    showNotice('Started an empty project. The previous one is under Open recent.')
  }

  const startCircuit = (name, diagram, afterViewId) => {
    const sheet = createSheet({ id: makeId(), name, diagram })
    const view = { id: sheet.id, documentId: sheet.id, name, region: null }
    setSheets((current) => [...current, sheet])
    setViews((current) => insertViewAfter(current, afterViewId, view))
    activate(sheet.id)
  }

  const newCircuit = (afterViewId) => {
    const names = new Set(sheets.map((sheet) => sheet.name))
    let number = sheets.length + 1
    while (names.has(`Circuit ${number}`)) number += 1
    startCircuit(`Circuit ${number}`, EMPTY_DIAGRAM, afterViewId)
    showNotice('New empty circuit added.')
  }

  const sheetActions = {
    rename: (viewId, name) => {
      const renamed = renameView({ sheets, views }, viewId, name)
      if (!renamed) return
      setSheets(renamed.sheets)
      setViews(renamed.views)
    },
    duplicate: (viewId) => {
      const view = views.find((item) => item.id === viewId)
      const source = sheets.find((sheet) => sheet.id === view.documentId)
      const copy = duplicateView({ views, bom }, viewId, source.editorRef.current?.getDiagram() || source.diagram, makeId)
      if (copy.sheet) setSheets((current) => [...current, createSheet(copy.sheet)])
      setViews(copy.views)
      setBom(copy.bom)
      activeSheet.editorRef.current.clearSelection()
      activate(copy.viewId)
      showNotice(copy.sheet ? 'Circuit duplicated. The copy has its own drawing and edit history.' : 'Section view duplicated.')
    },
    move: (viewId, offset) => {
      const moved = moveView(views, viewId, offset)
      if (moved) setViews(moved)
    },
    newAfter: (viewId) => newCircuit(viewId),
    exportSvg: () => activeSheet.editorRef.current.exportSvg(),
    clear: () => clearCircuit(),
    remove: (viewId) => {
      const view = views.find((item) => item.id === viewId)
      const result = removeView({ sheets, views, bom }, viewId)
      if (!result) return
      const extras = [
        result.linkedViews && `${result.linkedViews} linked section view${result.linkedViews > 1 ? 's' : ''}`,
        result.bomRows && `${result.bomRows} BOM row${result.bomRows > 1 ? 's' : ''}`,
      ].filter(Boolean)
      const message = view.section
        ? `Delete the section view "${view.name}"? The circuit it shows is kept.`
        : `Delete the circuit "${view.name}"${extras.length ? ` with its ${extras.join(' and ')}` : ''}? This cannot be undone.`
      if (!window.confirm(message)) return
      activeSheet.editorRef.current.clearSelection()
      setSheets(result.sheets)
      setViews(result.views)
      setBom(result.bom)
      if (viewId === activeView.id) activate(result.nextActiveId)
      showNotice(view.section ? 'Section view deleted.' : 'Circuit deleted.')
    },
  }

  const clearCircuit = () => {
    if (!window.confirm(`Remove everything drawn on "${activeSheet.name}"? Linked views of this circuit are cleared too. You can undo this.`)) return
    activeSheet.editorRef.current.clearCircuit()
    showNotice('Circuit cleared.')
  }

  const createSection = (name, region) => {
    const section = { id: makeId(), documentId: activeSheet.id, name, region, section: true }
    setViews((current) => [...current, section])
    activate(section.id)
    showNotice('Linked section created. Edits are shared with the original circuit.')
  }

  const selectView = (id) => {
    activeSheet.editorRef.current.clearSelection()
    activate(id)
  }

  const removeSectionView = () => {
    activeSheet.editorRef.current.clearSelection()
    setViews((current) => current.filter((item) => item.id !== activeView.id))
    activate(activeSheet.id)
  }

  const updateBomSpecifications = (documentId, updates) => {
    setBom((current) =>
      current.map((item) => {
        const update = item.documentId === documentId && updates.find((entry) => entry.label === item.label)
        return update ? { ...item, ...update.changes } : item
      }),
    )
  }

  const currentCircuits = () => sheets.map((sheet) => ({ id: sheet.id, name: sheet.name, diagram: sheet.editorRef.current?.getDiagram() || sheet.diagram }))

  // Lists the components of the circuits in the BOM. Circuits that use one reference twice are offered a rename first, since a
  // BOM names its parts by reference. Returns whether the BOM was generated.
  const generateBomFromCircuits = () => {
    let circuits = currentCircuits()
    const { renames, unresolved } = planUniqueReferences(circuits)
    if (unresolved.length) {
      window.alert(
        `A BOM needs a unique reference for every part, but ${unresolved.map((item) => `${item.label} is used more than once in "${item.circuitName}"`).join(' and ')}. Give those parts different references and try again.`,
      )
      return false
    }
    if (renames.length) {
      const list = renames.map((item) => `${item.from.trim()} → ${item.to}  (${findLibraryItem(item.type).name} in "${item.circuitName}")`).join('\n')
      if (!window.confirm(`A BOM names each part by its reference, and some references are used twice:\n\n${list}\n\nRename these parts so the BOM can be generated?`)) return false
    }
    circuits = withRenames(circuits, renames)
    let rows
    try {
      rows = generateBom(circuits, bom)
    } catch (error) {
      window.alert(`Could not generate the BOM: ${error.message}`)
      return false
    }
    if (
      bom.length &&
      !window.confirm(
        'List the circuit components in the BOM again? Values and ratings are taken from the circuits; descriptions and extra columns of parts already listed are kept.',
      )
    )
      return false
    for (const circuit of circuits) {
      const mine = renames.filter((item) => item.circuitId === circuit.id)
      if (mine.length) sheets.find((sheet) => sheet.id === circuit.id).editorRef.current.renameComponents(Object.fromEntries(mine.map((item) => [item.id, item.to])))
    }
    setBom(rows)
    setBomShown(true)
    showNotice(`BOM generated: ${rows.length} part${rows.length === 1 ? '' : 's'}${renames.length ? `, ${renames.length} renamed` : ''}.`)
    return true
  }

  // A cell of the BOM sheet was edited. Value and ratings go to the part in its circuit as well.
  const editBomItem = (item, column, value) => {
    const change = column.specification !== undefined ? { specifications: { ...item.specifications, [column.specification]: value } } : { [column.key]: value }
    setBom((current) => updateBomItem(current, item.documentId, item.label, change))
    if (column.specification === undefined && column.key !== 'description')
      sheets.find((sheet) => sheet.id === item.documentId)?.editorRef.current?.applyBom([{ ...item, ...change }])
  }

  // BOM rows with no component in any circuit are removed, after asking.
  const removeBomItems = (items) => {
    const names = items.map((item) => item.label).join(', ')
    if (!window.confirm(`Remove ${items.length === 1 ? 'this row' : `these ${items.length} rows`} from the BOM (${names})? No circuit is changed.`)) return
    setBom((current) => withoutBomItems(current, items))
    showNotice(`Removed ${items.length} BOM row${items.length === 1 ? '' : 's'}.`)
  }

  const addBomColumn = (name) => {
    if (isBuiltInColumn(name)) {
      showNotice(`${name} is a column of the BOM already.`)
      return
    }
    if (bom.some((item) => name in (item.specifications || {}))) {
      showNotice(`There is already a column called ${name}.`)
      return
    }
    setBom((current) => current.map((item) => ({ ...item, specifications: { ...item.specifications, [name]: '' } })))
  }

  // `importedRows` is null when the BOM was generated or cleared rather than imported.
  const replaceBom = (items, importedRows) => {
    const applyToCircuits = importedRows && window.confirm('Apply matching BOM specifications to existing components? This can replace their current values and types.')
    if (applyToCircuits) assertUniqueMatchedReferences(currentCircuits(), importedRows)
    setBom(items)
    if (applyToCircuits) sheets.forEach((sheet) => sheet.editorRef.current.applyBom(importedRows))
    showNotice('Project BOM updated.')
  }

  return (
    <div className="app-shell">
      <TopBar
        projectName={projectName}
        onProjectNameChange={setProjectName}
        onExport={() => activeSheet.editorRef.current.exportSvg()}
        onImport={() => setImportOpen(true)}
        onSaveProject={() => files.saveProject()}
        saveTitle={fileHandle ? `Save to ${fileHandle.name}` : 'Save to a new file'}
        onBom={() => setBomShown(true)}
        onTest={() => setTestOpen(true)}
        onNewCircuit={() => newCircuit()}
        onClearCircuit={clearCircuit}
        project={{
          onNew: newProject,
          onOpen: files.openProject,
          onOpenRecent: files.openRecent,
          onClearRecent: files.clearRecent,
          onSaveAs: files.saveProjectAs,
          canOpenFiles: canWriteFiles(),
        }}
      />
      <SheetBar
        options={labelViews(views)}
        activeView={activeView}
        bomTab={{ active: bomShown, count: bom.length, onSelect: () => setBomShown(true) }}
        onSelect={selectView}
        onRemoveSection={removeSectionView}
        actions={sheetActions}
      />
      {bomShown && (
        <BomSheet
          bom={bom}
          circuits={currentCircuits()}
          onEdit={editBomItem}
          onAddColumn={addBomColumn}
          onGenerate={generateBomFromCircuits}
          onRemove={removeBomItems}
          onAddMissing={() => setBom((current) => addMissingToBom(currentCircuits(), current))}
          onOpenFiles={() => setBomOpen(true)}
        />
      )}
      {sheets.map((sheet) => {
        const isActive = sheet.id === activeSheet.id
        return (
          <SheetEditor
            key={sheet.id}
            sheet={sheet}
            view={isActive ? activeView : null}
            visible={isActive && !bomShown}
            active={isActive && !bomShown && !importOpen && !bomOpen && !files.saveAsOpen && !testOpen}
            projectName={projectName}
            bom={bom}
            onNotice={showNotice}
            onCreateSection={createSection}
            onUpdateBom={updateBomSpecifications}
          />
        )
      })}
      {testOpen && (
        <TestCircuitDialog
          circuitName={activeSheet.name}
          getDiagram={() => activeSheet.editorRef.current.getDiagram()}
          onSelect={(ids) => {
            setTestOpen(false)
            activeSheet.editorRef.current.selectComponents(ids)
          }}
          onClose={() => setTestOpen(false)}
        />
      )}
      {files.saveAsOpen && (
        <NameDialog title="Save project as" label="Project name" initialName={projectName} confirmLabel="Save" onConfirm={files.downloadProject} onClose={files.closeSaveAs} />
      )}
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onImport={importSheets} onImportProject={importProject} />}
      {bomOpen && (
        <BomDialog
          circuits={currentCircuits()}
          bom={bom}
          candidates={bomCandidates}
          onConsumeCandidate={(id) => setBomCandidates((current) => current.filter((item) => item.id !== id))}
          activeCircuitId={activeSheet.id}
          projectName={projectName}
          onClose={() => setBomOpen(false)}
          onReplace={replaceBom}
          onGenerate={generateBomFromCircuits}
        />
      )}
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </div>
  )
}

export default App
