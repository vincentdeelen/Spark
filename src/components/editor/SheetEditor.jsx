import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { BOM_RATING_FIELDS } from '../../circuit/ratings.js'
import { findLibraryItem } from '../../circuit/library.js'
import { applyCatalogEntry, catalogEntryOfTool } from '../../circuit/transformerCatalog.js'
import { splitSectionLabel, typeForBom } from '../../tubes/triodes.js'
import { componentFromBom, historyBomUpdates, matchBom } from '../../bom/bom.js'
import { isTwoTerminal, scaleOf } from '../../circuit/partGeometry.js'
import { prepareArrangement } from '../../circuit/connections.js'
import { labelProblems, optimizeLabels, withLabelPlacements } from '../../circuit/labelLayout.js'
import {
  changeSubtypes,
  changeWireEnd,
  createComponent,
  createWire,
  insertIntoWire,
  moveComponent,
  referenceScale,
  rotateComponents,
  scaleComponent,
  setRibbonWireCount,
  twoTerminalUnder,
  withComponent,
  withWire,
  withoutElements,
} from '../../circuit/diagramOps.js'
import { downloadBlob, fileBaseName } from '../../project/download.js'
import { GRID_SIZE, snapToGrid } from '../../shared/grid.js'
import { clampZoom, DEFAULT_ZOOM, resizedScale } from '../../shared/zoom.js'
import useDiagramHistory from '../../hooks/useDiagramHistory.js'
import useEditorShortcuts from '../../hooks/useEditorShortcuts.js'
import useSectionDraft from '../../hooks/useSectionDraft.js'
import useSelection from '../../hooks/useSelection.js'
import { makeId } from '../../shared/ids.js'
import { nextReference, normalizeLabel } from '../../circuit/references.js'
import { pointInRegion } from '../../circuit/sections.js'
import { serializeDiagramSvg } from '../../project/svgExport.js'
import { attachedEnds } from '../../circuit/wireFollow.js'
import CircuitEditor from './CircuitEditor.jsx'
import ContextMenu from './ContextMenu.jsx'
import { buildContextMenu } from './menuModels.js'
import { rearrangeInWorker } from './rearrangeInWorker.js'
import ComponentLibrary, { DRAG_TYPE } from '../library/ComponentLibrary.jsx'
import PropertiesPanel from '../properties/PropertiesPanel.jsx'
import TrainingDialog from '../dialogs/TrainingDialog.jsx'
import './SheetEditor.css'

const MIN_SECTION_SIZE = 4 * GRID_SIZE
const BOM_EDITABLE_FIELDS = ['value', ...BOM_RATING_FIELDS]

// One circuit's editing workspace. `view.region` is set when the sheet is shown through a linked section.
// The parent drives it through `sheet.editorRef` (export, clear selection, read diagram, apply BOM).
export default function SheetEditor({ sheet, view, active, visible, projectName, bom, onNotice, onCreateSection, onUpdateBom }) {
  const region = view?.region
  const history = useDiagramHistory(sheet.diagram)
  const { diagram, setDiagram, commit, recordHistory } = history
  const selection = useSelection()
  const section = useSectionDraft()
  const [multiSelect, setMultiSelect] = useState(false)
  const [connectionError, setConnectionError] = useState('')
  const [tool, setTool] = useState('select')
  const [wireStart, setWireStart] = useState(null)
  const [cursor, setCursor] = useState(null)
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const [showReference, setShowReference] = useState(true)
  const [trainingOpen, setTrainingOpen] = useState(false)
  // The open popup menu (right-click on a component, or the connect options after placing one) and a pending series/parallel pick.
  const [menu, setMenu] = useState(null)
  const [connecting, setConnecting] = useState(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const svgRef = useRef(null)
  const dragRef = useRef(null)
  // Components whose next move leaves their wires where they are (after "Detach from wires").
  const [detachedIds, setDetachedIds] = useState(() => new Set())
  // The circuit as it was rearranged, offered to keep or revert for as long as nothing else has been changed.
  const [rearranged, setRearranged] = useState(null)
  const [rearranging, setRearranging] = useState(false)
  // The circuit as it is now, for work that finishes later and must not be applied to a circuit that changed meanwhile.
  const latestDiagram = useRef(diagram)
  useEffect(() => {
    latestDiagram.current = diagram
  }, [diagram])

  const changeTool = (next) => {
    setTool(next)
    setMenu(null)
    setConnecting(null)
    setWireStart(null)
    selection.clear()
    setMultiSelect(false)
    setConnectionError('')
    section.reset()
  }

  const resetEditor = () => {
    changeTool('select')
    dragRef.current = null
  }

  const selectTool = () => {
    setTool('select')
    setWireStart(null)
    setMultiSelect(false)
    section.abandonDrawing()
  }

  const toggleMultiSelect = () => {
    setMultiSelect((value) => !value)
    setTool('select')
    setWireStart(null)
    section.reset()
    selection.focusLast()
    setConnectionError('')
  }

  // Undo/redo may change fields that are specified in the BOM; confirm before letting the BOM drift.
  const confirmBomSync = (target) => {
    const updates = historyBomUpdates(diagram, target, bom, sheet.id)
    if (updates.length && !window.confirm('This history change differs from the BOM. Update the BOM as well? Cancel keeps the current circuit.')) return false
    if (updates.length) onUpdateBom(sheet.id, updates)
    return true
  }

  const afterHistoryStep = () => {
    selection.clear()
    setConnectionError('')
    setWireStart(null)
  }

  const undo = () => {
    if (history.undo(confirmBomSync)) afterHistoryStep()
  }

  const redo = () => {
    if (history.redo(confirmBomSync)) afterHistoryStep()
  }

  const removeSelected = () => {
    if (!selection.selected) return
    const ids = new Set(selection.selectedIds.length ? selection.selectedIds : [selection.selected])
    const leavesSection = region && diagram.wires.some((wire) => ids.has(wire.id) && wire.points.some((point) => !pointInRegion(point, region)))
    if (leavesSection && !window.confirm('This wire continues outside the section. Deleting it removes the entire wire from the shared circuit. Continue?')) return
    commit(withoutElements(diagram, ids))
    selection.clear()
    setConnectionError('')
  }

  useEditorShortcuts(active && !trainingOpen, { undo, redo, removeSelected, escape: () => changeTool('select'), selectTool, wireTool: () => changeTool('wire') })

  const pointFromEvent = (event, snap = true) => {
    const svg = svgRef.current
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const transformed = point.matrixTransform(svg.getScreenCTM().inverse())
    return snap ? [snapToGrid(transformed.x), snapToGrid(transformed.y)] : [transformed.x, transformed.y]
  }

  const addSectionCorner = (point) => {
    if (!section.start) {
      section.setStart(point)
      return
    }
    const drawn = [Math.min(section.start[0], point[0]), Math.min(section.start[1], point[1]), Math.max(section.start[0], point[0]), Math.max(section.start[1], point[1])]
    if (drawn[2] - drawn[0] < MIN_SECTION_SIZE || drawn[3] - drawn[1] < MIN_SECTION_SIZE) {
      section.setError('Choose corners at least four grid squares apart.')
      return
    }
    section.finishRegion(drawn)
  }

  const addWirePoint = (point) => {
    if (!wireStart) setWireStart(point)
    else if (point[0] !== wireStart[0] || point[1] !== wireStart[1]) {
      commit(withWire(diagram, createWire([wireStart, [point[0], wireStart[1]], point])))
      setWireStart(null)
    }
  }

  const placeComponent = (point, type = tool, screen) => {
    // A known transformer from the catalog is a transformer of its kind with the part's details filled in.
    const catalogEntry = catalogEntryOfTool(type)
    const base = createComponent(findLibraryItem(catalogEntry ? catalogEntry.type : type), diagram.components, {
      x: point[0],
      y: point[1],
      scale: diagram.reference ? referenceScale(diagram.components) : 1,
    })
    const component = catalogEntry ? applyCatalogEntry(base, catalogEntry) : base
    const bomItem = matchBom(bom, sheet.id, component.label)
    if (
      bomItem?.type &&
      typeForBom(bomItem.type, component.type) !== component.type &&
      !window.confirm(`${component.label} is listed as ${findLibraryItem(bomItem.type).name} in the BOM. Place the BOM component instead?`)
    )
      return
    const placed = bomItem ? componentFromBom(component, bomItem) : component
    const withPlaced = withComponent(diagram, placed)
    const target = twoTerminalUnder(diagram, placed, point)
    // A two-terminal part placed on a wire is connected into it: turned along the wire, which is cut to meet its terminals.
    const attached = !target && isTwoTerminal(placed) ? insertIntoWire(withPlaced, placed.id, point, snapToGrid) : null
    commit(attached ?? withPlaced)
    selection.selectComponent(component.id)
    setTool('select')
    if (attached) onNotice(`${placed.label} connected into the wire.`)
    // Placed on another part, it may go in series or in parallel with it.
    if (target && screen) setMenu({ kind: 'drop', x: screen.x, y: screen.y, id: placed.id, targetId: target.id })
  }

  const handleDragOver = (event) => {
    if (!event.dataTransfer.types.includes(DRAG_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  const handleDrop = (event) => {
    const type = event.dataTransfer.getData(DRAG_TYPE)
    if (!findLibraryItem(type) && !catalogEntryOfTool(type)) return
    event.preventDefault()
    const point = pointFromEvent(event)
    if (region && !pointInRegion(point, region)) return
    placeComponent(point, type, { x: event.clientX, y: event.clientY })
  }

  const handleCanvasClick = (event) => {
    if (section.pending) return
    if (dragRef.current?.moved) {
      dragRef.current = null
      return
    }
    dragRef.current = null
    if (connecting) {
      setConnecting(null)
      return
    }
    const point = pointFromEvent(event)
    if (region && !pointInRegion(point, region)) return
    if (tool === 'section') addSectionCorner(point)
    else if (tool === 'wire') addWirePoint(point)
    else if (tool !== 'select') placeComponent(point, tool, { x: event.clientX, y: event.clientY })
    else {
      selection.clear()
      setConnectionError('')
    }
  }

  const startDrag = (event, component) => {
    if (tool !== 'select' || section.pending || event.button !== 0) return
    event.stopPropagation()
    if (connecting) {
      finishConnecting(component)
      return
    }
    setConnectionError('')
    if (event.shiftKey || multiSelect) {
      selection.toggle(component.id)
      dragRef.current = null
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    // Wires ending on the component follow it, unless it was detached or Alt (Option) is held.
    const detached = event.altKey || detachedIds.has(component.id)
    dragRef.current = { id: component.id, start: pointFromEvent(event), original: diagram, moved: false, attached: detached ? {} : attachedEnds(diagram, [component.id]) }
    selection.selectComponent(component.id)
  }

  // The component picked after "Connect in series/parallel" in a component's menu is the one it is connected with.
  const finishConnecting = (target) => {
    const { mode, id } = connecting
    setConnecting(null)
    if (target.id === id) return
    if (!isTwoTerminal(target)) {
      onNotice(`${target.label} has more than two terminals and cannot be connected in ${mode}.`)
      return
    }
    arrangeComponents(mode, [id, target.id])
  }

  // Right-clicking an item opens its menu; an item outside the current selection becomes the selection first.
  const openMenu = (event, kind, id, point) => {
    event.preventDefault()
    event.stopPropagation()
    if (tool !== 'select' || section.pending) return
    if (!selection.selectedIds.includes(id)) selection.selectComponent(id)
    setConnecting(null)
    setMenu({ kind, x: event.clientX, y: event.clientY, id, point })
  }
  const openComponentMenu = (event, component) => openMenu(event, 'component', component.id)
  const openWireMenu = (event, wire) => openMenu(event, 'wire', wire.id, pointFromEvent(event, false))

  // Dragging a corner handle resizes the component around its centre; one undo step covers the whole drag.
  const startResize = (event, component) => {
    if (tool !== 'select' || section.pending) return
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      id: component.id,
      resize: { scale: scaleOf(component), center: [component.x, component.y], start: pointFromEvent(event, false) },
      original: diagram,
      moved: false,
    }
  }

  const movePointer = (event) => {
    const point = pointFromEvent(event)
    setCursor(point)
    const drag = dragRef.current
    if (!drag) return
    if (drag.resize) {
      const scale = resizedScale(drag.resize.scale, drag.resize.center, drag.resize.start, pointFromEvent(event, false))
      if (scale === drag.resize.scale && !drag.moved) return
      drag.moved = true
      setDiagram(scaleComponent(drag.original, drag.id, scale))
      return
    }
    const dx = point[0] - drag.start[0]
    const dy = point[1] - drag.start[1]
    if (dx || dy) drag.moved = true
    setDiagram(moveComponent(drag.original, drag.id, dx, dy, drag.attached))
  }

  const endDrag = () => {
    const drag = dragRef.current
    if (drag?.moved) {
      recordHistory(drag.original)
      // A detached component is detached for one move: from its new place, wires drawn to it follow it again.
      if (detachedIds.has(drag.id)) setDetachedIds((current) => new Set([...current].filter((id) => id !== drag.id)))
    } else dragRef.current = null
  }

  const selectedComponent = diagram.components.find((item) => item.id === selection.selected)
  const selectedWire = diagram.wires.find((item) => item.id === selection.selected)
  const selectedComponents = selection.selectedIds.map((id) => diagram.components.find((item) => item.id === id)).filter(Boolean)
  const selectedWires = selection.selectedIds.map((id) => diagram.wires.find((item) => item.id === id)).filter(Boolean)

  // Applies a property edit to the selected component, reconciling it with its BOM entry.
  // Returns false when the edit was rejected so the form can keep the user's previous value.
  const updateComponent = (changes) => {
    let updated = { ...selectedComponent, ...changes }
    // Relabelling a triode section V2A to V2B also makes it the second triode.
    const section = changes.label !== undefined && 'section' in selectedComponent && splitSectionLabel(changes.label)?.section
    if (section) updated = { ...updated, section }
    const item = matchBom(bom, sheet.id, updated.label)
    const relabelled = item && changes.label !== undefined
    if (relabelled && diagram.components.some((component) => component.id !== selection.selected && normalizeLabel(component.label) === normalizeLabel(updated.label))) {
      window.alert(`${updated.label} already exists in this circuit. Use a unique reference before matching a BOM item.`)
      return false
    }
    if (relabelled && normalizeLabel(changes.label) !== normalizeLabel(selectedComponent.label)) {
      const matched = componentFromBom(updated, item)
      if (JSON.stringify(matched) !== JSON.stringify(updated) && !window.confirm(`Apply BOM specifications for ${item.label} to this component? Cancel keeps the previous label.`))
        return false
      updated = matched
    } else if (item) {
      const fields = BOM_EDITABLE_FIELDS.filter((field) => changes[field] !== undefined && changes[field] !== (item[field] ?? ''))
      if (fields.length) {
        if (!window.confirm(`${item.label} differs from the BOM. Update the BOM with the new ${fields.join(', ')}? Cancel discards the edit.`)) return false
        onUpdateBom(sheet.id, [{ label: item.label, changes: Object.fromEntries(fields.map((field) => [field, changes[field]])) }])
      }
    }
    commit({ ...diagram, components: diagram.components.map((component) => (component.id === selection.selected ? updated : component)) })
    return true
  }

  // Switches the selected transformer to a part from the catalog; the BOM is asked about differences like for any edit.
  const applyCatalog = (entry) => {
    const next = { ...diagram, components: diagram.components.map((component) => (component.id === selection.selected ? applyCatalogEntry(component, entry) : component)) }
    if (confirmBomSync(next)) commit(next)
  }

  const updateWire = (changes) => {
    commit({ ...diagram, wires: diagram.wires.map((wire) => (wire.id === selection.selected ? { ...wire, ...changes } : wire)) })
  }

  const arrangeComponents = (mode, ids = selection.selectedIds) => {
    const result = prepareArrangement(diagram, ids, mode, makeId)
    if (result.error) {
      setConnectionError(result.error)
      onNotice(result.error)
      return
    }
    if (
      result.removedWires.length &&
      !window.confirm(`This will remove ${result.removedWires.length} existing wire(s), including entire wires that may connect other components. Continue?`)
    )
      return
    commit(result.diagram)
    setZoom((value) => clampZoom(Math.min(value, result.maxZoom)))
    setConnectionError('')
  }

  // Puts every label next to its component, clear of other parts, wires and labels.
  const optimizeLabelPlacement = () => {
    const next = withLabelPlacements(diagram, optimizeLabels(diagram).placements)
    const [before, after] = [labelProblems(diagram).length, labelProblems(next).length]
    commit(next)
    onNotice(
      after
        ? `Labels optimized: ${before} unclear or overlapping, ${after} left (not enough room; they were made as small and as close as they can be).`
        : before
          ? `Labels optimized: ${before} unclear or overlapping labels fixed.`
          : 'Labels placed next to their components.',
    )
  }

  // Moves the components to cross fewer wires; the result stays on offer to keep or revert.
  const rearrangeComponents = async () => {
    if (region) {
      onNotice('Rearranging works on the whole circuit. Open the circuit itself, not a linked section of it.')
      return
    }
    if (rearranging) return
    setRearranging(true)
    onNotice('Rearranging… this can take a few seconds.')
    try {
      const result = await rearrangeInWorker(diagram)
      if (latestDiagram.current !== diagram) {
        onNotice('The circuit changed while it was being rearranged, so nothing was moved.')
        return
      }
      if (!result.changed) {
        onNotice(result.reason)
        return
      }
      const next = withLabelPlacements(result.diagram, optimizeLabels(result.diagram).placements)
      commit(next)
      selection.clear()
      const change = Math.round((100 * (result.after.length - result.before.length)) / Math.max(1, result.before.length))
      setRearranged({
        diagram: next,
        text: `${result.moved} components moved · crossings ${result.before.hops} → ${result.after.hops} · wire length ${change > 0 ? '+' : ''}${change}%`,
      })
      onNotice('Rearranged. Keep the result or revert it.')
    } catch (error) {
      onNotice(`Could not rearrange: ${error.message}`)
    } finally {
      setRearranging(false)
    }
  }

  const exportSvg = async () => {
    try {
      const markup = await serializeDiagramSvg(svgRef.current, diagram, region)
      downloadBlob(new Blob([markup], { type: 'image/svg+xml' }), `${fileBaseName(projectName)}.svg`)
      onNotice('SVG exported')
    } catch (error) {
      window.alert(`Could not export SVG: ${error.message}`)
    }
  }

  const applyBom = (items) => {
    const components = diagram.components.map((component) => {
      const item = matchBom(items, sheet.id, component.label)
      return item ? componentFromBom(component, item) : component
    })
    if (JSON.stringify(components) !== JSON.stringify(diagram.components)) commit({ ...diagram, components })
  }

  const clearCircuit = () => {
    resetEditor()
    commit({ ...diagram, components: [], wires: [] })
  }

  // `selectComponents` lets the circuit test point at the parts it has findings about.
  useImperativeHandle(sheet.editorRef, () => ({
    exportSvg,
    clearSelection: resetEditor,
    getDiagram: () => diagram,
    applyBom,
    renameComponents: (labels) =>
      commit({ ...diagram, components: diagram.components.map((component) => (labels[component.id] ? { ...component, label: labels[component.id] } : component)) }),
    clearCircuit,
    selectComponents: (ids) => selection.setComponents(ids),
  }))

  const submitSection = () => {
    const name = section.name.trim()
    if (!name) {
      section.setError('Enter a section name.')
      return
    }
    onCreateSection(name, section.pending)
    resetEditor()
  }

  const removeReference = () => {
    if (!region || window.confirm('Remove the reference from the shared circuit and all its linked views?')) commit({ ...diagram, reference: null })
  }

  // Teach & review callbacks: validate against the BOM first, then add the marked element.
  const beforeTrainingAdd = ({ type, label }) => {
    const reference = label || nextReference(findLibraryItem(type), diagram.components)
    const bomItem = matchBom(bom, sheet.id, reference)
    if (bomItem && diagram.components.some((component) => normalizeLabel(component.label) === normalizeLabel(reference))) {
      window.alert(`${reference} already exists in this circuit. Choose a unique reference.`)
      return false
    }
    if (bomItem?.type && typeForBom(bomItem.type, type) !== type && !window.confirm(`${bomItem.label} has a different component type in the BOM. Add the BOM type instead?`))
      return false
    return { type: typeForBom(bomItem?.type, type), label: reference }
  }

  const addTrainedComponents = (items) => {
    const added = []
    const fallbackScale = referenceScale(diagram.components)
    for (const { type, rotation, label, center, value = '', scale = fallbackScale } of items) {
      const component = createComponent(findLibraryItem(type), [...diagram.components, ...added], { x: center[0], y: center[1], rotation, label, value, scale })
      const bomItem = matchBom(bom, sheet.id, component.label)
      added.push(bomItem ? componentFromBom(component, bomItem) : component)
    }
    commit({ ...diagram, components: [...diagram.components, ...added] })
    if (added.length === 1) selection.selectComponent(added[0].id)
    else selection.setComponents(added.map((component) => component.id))
  }

  const addTrainedWire = ({ points, label }) => {
    const wire = createWire(points, label)
    commit(withWire(diagram, wire))
    selection.selectWire(wire.id)
  }

  const ids = (components) => components.map((component) => component.id)
  const menuView =
    menu &&
    buildContextMenu({
      menu,
      diagram,
      detachedIds,
      selection: { ids: selection.selectedIds, components: selectedComponents, wires: selectedWires },
      actions: {
        removeSelected,
        arrange: arrangeComponents,
        startConnecting: (mode, id) => setConnecting({ mode, id }),
        rotate: (components, step) => commit(rotateComponents(diagram, ids(components), step)),
        changeSubtype: (components, type) => {
          const next = changeSubtypes(diagram, ids(components), type)
          if (confirmBomSync(next)) commit(next)
        },
        setRibbonWires: (components, count) => commit(setRibbonWireCount(diagram, ids(components), count)),
        setWireEnd: (wire, key, changes) => commit(changeWireEnd(diagram, wire.id, key, changes)),
        toggleDetach: (component, detached) => {
          setDetachedIds((current) => {
            const next = new Set(current)
            if (detached) next.delete(component.id)
            else next.add(component.id)
            return next
          })
          onNotice(detached ? `${component.label} keeps its wires again.` : `${component.label} is detached: drag it to its new place and its wires stay where they are.`)
        },
      },
    })

  return (
    <div className="workspace" hidden={!visible}>
      <ComponentLibrary tool={tool} onToolChange={changeTool} />
      <CircuitEditor
        projectName={projectName}
        diagram={diagram}
        selectedIds={selection.selectedIds}
        tool={tool}
        wireStart={wireStart}
        cursor={cursor}
        zoom={zoom}
        svgRef={svgRef}
        multiSelect={multiSelect}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        canTidy={diagram.components.length > 0 && !rearranging}
        arrangement={
          rearranged?.diagram === diagram
            ? {
                text: rearranged.text,
                onKeep: () => setRearranged(null),
                onRevert: () => {
                  undo()
                  setRearranged(null)
                },
              }
            : undefined
        }
        showReference={showReference}
        section={{
          region,
          clipId: `section-${sheet.id}`,
          start: section.start,
          pending: section.pending,
          name: section.name,
          error: section.error,
          onNameChange: section.setName,
          onCreate: submitSection,
          onCancel: resetEditor,
        }}
        onMultiSelectChange={toggleMultiSelect}
        onToolChange={changeTool}
        onUndo={undo}
        onRedo={redo}
        onOptimizeLabels={optimizeLabelPlacement}
        onRearrange={rearrangeComponents}
        onCanvasClick={handleCanvasClick}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onPointerMove={movePointer}
        onPointerUp={endDrag}
        onPointerLeave={() => setCursor(null)}
        onWireSelect={(id, event) => {
          if (event.shiftKey || multiSelect) selection.toggle(id)
          else selection.selectWire(id)
          setConnectionError('')
        }}
        onComponentPointerDown={startDrag}
        onResizeStart={startResize}
        onComponentContextMenu={openComponentMenu}
        onWireContextMenu={openWireMenu}
        hint={
          connecting
            ? `Click the component to connect ${diagram.components.find((item) => item.id === connecting.id)?.label} in ${connecting.mode} with · Esc to cancel`
            : undefined
        }
        onComponentClick={(event) => {
          if (tool === 'select') {
            event.stopPropagation()
            dragRef.current = null
          }
        }}
        onZoomChange={setZoom}
        onToggleReference={() => setShowReference((value) => !value)}
        onRemoveReference={removeReference}
        onTeach={() => {
          resetEditor()
          setTrainingOpen(true)
        }}
      />
      <PropertiesPanel
        selectedComponent={selectedComponent}
        selectedComponents={selectedComponents}
        selectedWire={selectedWire}
        selectedWires={selectedWires}
        onUpdateComponent={updateComponent}
        onUpdateWire={updateWire}
        onApplyCatalog={applyCatalog}
        onRemoveSelected={removeSelected}
        onArrange={arrangeComponents}
        canArrange={selectedWires.length === 0 && selectedComponents.every(isTwoTerminal)}
        connectionError={connectionError}
        bomItem={selectedComponent && matchBom(bom, sheet.id, selectedComponent.label)}
        hasBom={bom.some((item) => item.documentId === sheet.id)}
      />
      {menuView && <ContextMenu x={menu.x} y={menu.y} title={menuView.title} items={menuView.items} onClose={closeMenu} />}
      {trainingOpen && diagram.reference && (
        <TrainingDialog
          reference={diagram.reference}
          region={region}
          components={diagram.components}
          bom={bom.filter((item) => item.documentId === sheet.id)}
          onClose={() => setTrainingOpen(false)}
          onBeforeAdd={beforeTrainingAdd}
          onAddComponent={(item) => addTrainedComponents([item])}
          onAddComponents={addTrainedComponents}
          onAddWire={addTrainedWire}
        />
      )}
    </div>
  )
}
