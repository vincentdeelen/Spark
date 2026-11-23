import { useEffect, useRef, useState } from 'react'
import { componentFamilies as families, findLibraryItem } from '../../circuit/library.js'
import { dualTriodeOf, triodeSectionType } from '../../tubes/triodes.js'
import { inferComponentType, labelCandidates } from '../../bom/bom.js'
import { detectBomComponents, inferBomType, matchReference, placeFor } from '../../bom/bomDetection.js'
import { valueNear } from '../../importing/componentValues.js'
import { nominalSymbolSize, scaleFromLabelHeight } from '../../circuit/partGeometry.js'
import { rotationFor } from '../../importing/orientation.js'
import { snapToGrid } from '../../shared/grid.js'
import { DEFAULT_ZOOM, MAX_SCALE, MIN_SCALE } from '../../shared/zoom.js'
import useZoomScroll from '../../hooks/useZoomScroll.js'
import useReferenceImage from '../../hooks/useReferenceImage.js'
import useReferenceLearning from '../../hooks/useReferenceLearning.js'
import useReferenceWords from '../../hooks/useReferenceWords.js'
import { createAssignment } from '../../importing/referenceLearning.js'
import BomDetectionList from './BomDetectionList.jsx'
import ZoomControls from '../editor/ZoomControls.jsx'
import {
  clearTraining,
  componentExample,
  findNearestExample,
  negativeExample,
  readDetector,
  readTraining,
  runDetectorExperiments,
  saveDetector,
  saveExample,
  wireExample,
} from '../../importing/training.js'
import '../../styles/buttons.css'
import '../../styles/dialog.css'
import './TrainingDialog.css'

export default function TrainingDialog({ reference, region, components, bom, onClose, onBeforeAdd, onAddComponent, onAddComponents, onAddWire }) {
  const [mode, setMode] = useState('component')
  const [split, setSplit] = useState('train')
  const [familyId, setFamilyId] = useState('resistor')
  const [type, setType] = useState('resistor')
  const [rotation, setRotation] = useState(0)
  const [label, setLabel] = useState('')
  const [zoom, setZoom] = useState(DEFAULT_ZOOM)
  const { scrollProps, changeZoom } = useZoomScroll(zoom, setZoom)
  const [points, setPoints] = useState([])
  const [suggestions, setSuggestions] = useState([])
  const [labels, setLabels] = useState([])
  const [detections, setDetections] = useState([])
  const [selectedWord, setSelectedWord] = useState(null)
  const [referenceLabel, setReferenceLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [count, setCount] = useState(0)
  const workerRef = useRef(null)
  const svgRef = useRef(null)
  const dragRef = useRef(null)
  const family = families.find((item) => item.id === familyId)
  const { model, loadError, learn, clear: clearLearned } = useReferenceLearning()
  const ocr = useReferenceWords(reference.dataUrl, true)

  const { image, sourceId } = useReferenceImage(reference.dataUrl, {
    onLoad: () => {
      try {
        setCount(readTraining().length)
      } catch (reason) {
        setError(reason.message)
      }
    },
    onError: setError,
  })

  // Stop any running detection when the reference changes or the dialog closes.
  useEffect(
    () => () => {
      workerRef.current?.terminate()
    },
    [reference],
  )

  const toDiagram = ([x, y]) => [(x * 1000) / image.width, (y * 700) / image.height]
  const inside = (point) => {
    if (!region) return true
    const [x, y] = toDiagram(point)
    return x >= region[0] && x <= region[2] && y >= region[1] && y <= region[3]
  }
  // The size a component needs to match a symbol marked in the image, as a multiple of the standard symbol.
  const scaleFor = (type, symbolBox) => {
    if (!symbolBox) return undefined
    const size = Math.max(((symbolBox[2] - symbolBox[0]) * 1000) / image.width, ((symbolBox[3] - symbolBox[1]) * 700) / image.height)
    return Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, size / nominalSymbolSize(type))) * 100) / 100
  }
  const wordBox = (word) => [word.x, word.y, word.x + word.width, word.y + word.height]
  const wordsInside = (words) => words.filter((word) => inside([word.x, word.y]) && inside([word.x + word.width, word.y + word.height]))
  const visibleWords = ocr.words && image ? wordsInside(ocr.words) : []
  // Text the user can click to pick a BOM reference: anything that looks like, or matches, a reference.
  const clickableWords = visibleWords.filter((word) => matchReference(word.text, bom, model) || /^[A-Za-z]{1,3}\d{1,3}[A-Za-z]?$/.test(word.text.replace(/^\W+|\W+$/g, '')))
  const wordAt = (point) => {
    const margin = 6
    const hits = visibleWords.filter(
      (word) => point[0] >= word.x - margin && point[0] <= word.x + word.width + margin && point[1] >= word.y - margin && point[1] <= word.y + word.height + margin,
    )
    const distance = (word) => Math.hypot(point[0] - (word.x + word.width / 2), point[1] - (word.y + word.height / 2))
    return hits.sort((a, b) => distance(a) - distance(b))[0] || null
  }
  // Choosing a BOM reference also sets the component type the BOM (or what was learned) implies for it.
  // A triode section (V2A) is drawn under its own label but belongs to the BOM's tube (V2).
  const applyBomItem = (item, section = '') => {
    setReferenceLabel(item.label)
    setLabel(`${item.label}${section}`)
    const inferred = section ? triodeSectionType(dualTriodeOf(item)) : inferBomType(item, model)
    const inferredFamily = families.find((entry) => entry.subtypes.some((subtype) => subtype.type === inferred))
    if (inferredFamily) {
      setFamilyId(inferredFamily.id)
      setType(inferred)
    }
  }
  const selectWord = (word) => {
    setSelectedWord(word)
    const match = matchReference(word.text, bom, model)
    if (match) applyBomItem(match.item, match.section)
    else setReferenceLabel('')
    setMessage(
      match
        ? `Label “${word.text}” matches BOM reference ${match.item.label}. Mark its symbol and save, or change the reference.`
        : `Label “${word.text}” selected. Choose its BOM reference, then mark its symbol.`,
    )
  }
  const pointFromEvent = (event) => {
    const point = svgRef.current.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const result = point.matrixTransform(svgRef.current.getScreenCTM().inverse())
    return [Math.max(0, Math.min(image.width - 1, result.x)), Math.max(0, Math.min(image.height - 1, result.y))]
  }
  const startMark = (event) => {
    if (!image || busy || event.button !== 0 || dragRef.current) return
    const point = pointFromEvent(event)
    if (!inside(point)) {
      setError('Marks must stay inside the current linked section.')
      return
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = { id: event.pointerId, start: point, clientX: event.clientX, clientY: event.clientY, previous: points, moved: false }
    setPoints([point])
    setError('')
    setMessage('')
  }
  const moveMark = (event) => {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId) return
    if (Math.hypot(event.clientX - drag.clientX, event.clientY - drag.clientY) >= 3) drag.moved = true
    if (drag.moved) setPoints([drag.start, pointFromEvent(event)])
  }
  const finishMark = (event) => {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId) return
    dragRef.current = null
    const end = pointFromEvent(event)
    if (!inside(end)) {
      setPoints([])
      setError('Marks must stay inside the current linked section.')
      return
    }
    const hit = mode === 'component' && !drag.moved ? wordAt(end) : null
    if (hit) {
      // A plain click on text picks the label instead of starting a symbol rectangle.
      setPoints(drag.previous)
      selectWord(hit)
      return
    }
    setPoints(drag.moved ? [drag.start, end] : drag.previous.length === 1 ? [drag.previous[0], end] : [end])
  }
  const cancelMark = (event) => {
    if (dragRef.current?.id !== event.pointerId) return
    dragRef.current = null
    setPoints([])
  }
  const box =
    points.length === 2
      ? [Math.min(points[0][0], points[1][0]), Math.min(points[0][1], points[1][1]), Math.max(points[0][0], points[1][0]), Math.max(points[0][1], points[1][1])]
      : null
  const record = (example) => {
    if (example.kind !== 'wire' && !sourceId) throw new Error('The image is not ready for training.')
    saveExample(example.kind === 'wire' ? example : { ...example, source: sourceId, split })
    setCount(readTraining().length)
  }
  // Remember what the user decided about a BOM reference: its type, the OCR text it was read as, and where its symbol sits.
  const learnAssignment = (assignedType, symbolBox) => {
    if (!referenceLabel) return
    learn(createAssignment({ reference: referenceLabel, type: assignedType, text: selectedWord?.text ?? '', labelBox: selectedWord ? wordBox(selectedWord) : null, symbolBox }))
  }
  const resetAssignment = () => {
    setSelectedWord(null)
    setReferenceLabel('')
  }
  // Without a marked symbol, a chosen label and reference are still taught and the component is placed at the expected symbol position.
  const labelOnly = mode === 'component' && !box && !!selectedWord && !!referenceLabel
  const saveLabelAssignment = () => {
    const confirmed = onBeforeAdd({ type, label: label.trim() || referenceLabel })
    if (!confirmed) return
    learnAssignment(confirmed.type, null)
    const { center } = placeFor(selectedWord, confirmed.type, model)
    onAddComponent({ ...confirmed, rotation, center: toDiagram(center).map(snapToGrid) })
    resetAssignment()
    setLabel('')
    setError('')
    setMessage(`${referenceLabel} learned and added near its label. Move it onto its symbol; mark the symbol next time to also teach its appearance and position.`)
  }
  const saveMark = () => {
    if (!image) return
    if (labelOnly) {
      try {
        saveLabelAssignment()
      } catch (reason) {
        setError(reason.message)
      }
      return
    }
    if (points.length !== 2) return
    let value = ''
    try {
      if (mode === 'component') {
        const confirmed = onBeforeAdd({ type, label: label.trim() })
        if (!confirmed) return
        record(componentExample(image, box, confirmed.type, rotation))
        learnAssignment(confirmed.type, box)
        value = valueNear(box, confirmed.type, visibleWords)
        onAddComponent({ ...confirmed, rotation, value, scale: scaleFor(confirmed.type, box), center: toDiagram([(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]) })
        resetAssignment()
      } else if (mode === 'negative') {
        record(negativeExample(image, box))
      } else {
        record(wireExample(image, points[0], points[1]))
        const [start, end] = points.map(toDiagram)
        const horizontal = Math.abs(end[0] - start[0]) >= Math.abs(end[1] - start[1])
        onAddWire({ label: label.trim(), points: [start, horizontal ? [end[0], start[1]] : [start[0], end[1]]] })
      }
      setPoints([])
      setLabel('')
      setError('')
      setMessage(
        mode === 'negative'
          ? 'Non-component example saved locally.'
          : `Example saved locally and added to the circuit.${value ? ` Value read from the drawing: ${value}.` : ''} Review its position and connections.`,
      )
    } catch (reason) {
      setError(reason.message)
    }
  }
  const find = () => {
    try {
      const model = readDetector()
      const examples = model ? model.templates : readTraining().filter((item) => item.kind === 'component' && item.split !== 'validation')
      if (!examples.length) throw new Error('Mark and save a component example first.')
      if (!image) throw new Error('The reference image is still loading.')
      setBusy(true)
      setError('')
      setMessage('')
      setSuggestions([])
      const worker = new Worker(new URL('../../importing/training.worker.js', import.meta.url), { type: 'module' })
      workerRef.current = worker
      worker.onmessage = ({ data }) => {
        worker.terminate()
        workerRef.current = null
        setBusy(false)
        if (data.error) setError(`Detection failed: ${data.error}`)
        else {
          const visible = data.suggestions.filter((item) => {
            if (!inside([item.box[0], item.box[1]]) || !inside([item.box[2], item.box[3]])) return false
            const [left, top] = toDiagram([item.box[0], item.box[1]])
            const [right, bottom] = toDiagram([item.box[2], item.box[3]])
            return !components.some((component) => component.x >= left && component.x <= right && component.y >= top && component.y <= bottom)
          })
          setSuggestions(visible)
          setMessage(
            `${visible.length} possible matches${data.suggestions.length === 100 ? ' (result limit reached)' : ''}. Review each against the reference before adding it. Matches may be wrong or missing.`,
          )
        }
      }
      worker.onerror = () => {
        worker.terminate()
        workerRef.current = null
        setBusy(false)
        setError('Could not run local detection.')
      }
      worker.postMessage({ image, examples, threshold: model?.threshold })
    } catch (reason) {
      workerRef.current?.terminate()
      workerRef.current = null
      setBusy(false)
      setError(reason.message)
    }
  }
  const experiment = () => {
    try {
      const examples = readTraining()
      const currentModel = readDetector()
      const result = runDetectorExperiments(examples, currentModel)
      if (result.model) saveDetector(result.model)
      const format = (score) => `${Math.round(score.f1 * 100)}%`
      const count = examples.filter((item) => item.split === 'validation').length
      setError('')
      setMessage(
        `Held-out patch F1 (${count} patches): ${format(result.baselineValidation)} → ${format(result.candidateValidation)}. ${result.model ? `Setting saved (similarity ${Math.round(result.threshold * 100)}%).` : 'No improvement; the existing detector was kept.'} These scores do not measure whole-image detection.`,
      )
    } catch (reason) {
      setError(reason.message)
    }
  }
  const accept = (index) => {
    const item = suggestions[index]
    try {
      const confirmed = onBeforeAdd({ type: item.type, label: '' })
      if (!confirmed) return
      record(componentExample(image, item.box, confirmed.type, item.rotation))
      onAddComponent({
        ...confirmed,
        rotation: item.rotation,
        value: valueNear(item.box, confirmed.type, visibleWords),
        scale: scaleFor(confirmed.type, item.box),
        center: toDiagram([(item.box[0] + item.box[2]) / 2, (item.box[1] + item.box[3]) / 2]),
      })
      setSuggestions((current) => current.filter((_, position) => position !== index))
      setError('')
      setMessage('Match added and saved as a local example. Check its position and connections.')
    } catch (reason) {
      setError(reason.message)
    }
  }
  // Words recognised in the reference image (read once), limited to the current section.
  const readWords = async () => wordsInside(await ocr.ensure())
  const findLabels = async () => {
    try {
      if (!bom.length) throw new Error('Import a BOM for this circuit first.')
      setBusy(true)
      setError('')
      setMessage('Reading labels locally…')
      setLabels([])
      const words = await readWords()
      const found = words.flatMap((word) => labelCandidates(word.text, bom).map((item) => ({ ...word, candidate: item.label })))
      setLabels(found)
      setMessage(`${found.length} possible BOM labels found. OCR can be wrong; review each and select its label before marking the corresponding symbol.`)
    } catch (reason) {
      setError(reason.message || 'Could not read labels.')
    } finally {
      setBusy(false)
    }
  }
  // Moves proposals onto the matching marked symbol when one is found next to the proposed position, and turns them the way
  // that symbol, or else the lines around the label, are drawn.
  const snapToSymbols = (items) => {
    const detector = readDetector()
    const templates = detector ? detector.templates : readTraining().filter((example) => example.kind === 'component' && example.split !== 'validation')
    const textBoxes = (ocr.words ?? [])
      .filter((word) => /[A-Za-z0-9]/.test(word.text) && word.height < 40)
      .map((word) => [word.x, word.y, word.x + word.width, word.y + word.height])
    return items.map((item) => {
      const height = item.box[3] - item.box[1]
      const hit = templates.length
        ? findNearestExample(image, templates, { type: item.type, center: item.center, radius: Math.max(40, 6 * height), threshold: detector?.threshold })
        : null
      const placed = hit
        ? { ...item, center: [(hit.box[0] + hit.box[2]) / 2, (hit.box[1] + hit.box[3]) / 2], placement: 'template', symbolBox: hit.box, symbolRotation: hit.rotation }
        : item
      return { ...placed, rotation: rotationFor(image, placed, textBoxes) }
    })
  }
  const detectFromBom = async () => {
    try {
      if (!bom.length) throw new Error('Import a BOM for this circuit first.')
      setBusy(true)
      setError('')
      setMessage('Looking for BOM references locally…')
      setDetections([])
      const result = detectBomComponents(await readWords(), bom, components, model)
      const proposals = snapToSymbols(result.detections)
      setDetections(proposals)
      const notes = [
        result.missing && `${result.missing} BOM references were not found`,
        result.untyped.length && `no component type for ${result.untyped.join(', ')}`,
        result.skippedTable && `${result.skippedTable} references in what looks like a BOM table were ignored`,
        result.jumpers.length &&
          `${result.jumpers.length} jumper labels not in the BOM were ignored (${result.jumpers.slice(0, 6).join(', ')}${result.jumpers.length > 6 ? ', …' : ''})`,
      ].filter(Boolean)
      setMessage(`${proposals.length} components proposed from BOM references${notes.length ? ` (${notes.join('; ')})` : ''}. OCR can be wrong; review each against the image.`)
    } catch (reason) {
      setError(reason.message || 'Could not read the BOM references.')
    } finally {
      setBusy(false)
    }
  }
  const detectionCenter = (item) => toDiagram(item.center).map(snapToGrid)
  // A detected part's size: that of the symbol it was matched to, else that of parts already sized to this drawing (left to the
  // editor), else an estimate from how tall the drawing's reference labels are.
  const labelHeight = (() => {
    const heights = detections
      .map((item) => item.textHeight)
      .filter((height) => height > 0)
      .sort((a, b) => a - b)
    return heights.length && image ? (heights[Math.floor(heights.length / 2)] * 1000) / image.width : 0
  })()
  const detectionScale = (type, item) =>
    scaleFor(type, item.symbolBox) ?? (components.some((component) => component.scale) ? undefined : (scaleFromLabelHeight(type, labelHeight) ?? undefined))
  const addDetection = (index) => {
    const item = detections[index]
    try {
      const confirmed = onBeforeAdd({ type: item.type, label: item.label })
      if (!confirmed) return
      // Accepting a near match confirms the OCR misread, so remember it.
      if (!item.exact) learn(createAssignment({ reference: item.reference, type: confirmed.type, text: item.text, labelBox: item.box }))
      onAddComponent({ ...confirmed, rotation: item.rotation ?? 0, scale: detectionScale(confirmed.type, item), center: detectionCenter(item) })
      setDetections((current) => current.filter((_, position) => position !== index))
      setError('')
      setMessage(`${item.label} added with its BOM specifications. Check that it sits on its symbol and connect it.`)
    } catch (reason) {
      setError(reason.message)
    }
  }
  const addAllDetections = () => {
    try {
      const added = detections
        .filter((item) => item.trusted)
        .flatMap((item) => {
          const confirmed = onBeforeAdd({ type: item.type, label: item.label })
          return confirmed ? [{ item, component: { ...confirmed, rotation: item.rotation ?? 0, scale: detectionScale(confirmed.type, item), center: detectionCenter(item) } }] : []
        })
      if (!added.length) return
      onAddComponents(added.map((entry) => entry.component))
      const addedLabels = new Set(added.map((entry) => entry.item.label))
      setDetections((current) => current.filter((item) => !addedLabels.has(item.label)))
      setError('')
      setMessage(`${added.length} components added with BOM specifications. Check that each sits on its symbol and connect them.`)
    } catch (reason) {
      setError(reason.message)
    }
  }

  return (
    <div className="dialog-backdrop training-backdrop">
      <section className="training-dialog" role="dialog" aria-modal="true" aria-labelledby="training-title">
        <div className="training-heading">
          <div>
            <h2 id="training-title">Teach &amp; review</h2>
            <p>Examples stay in this browser. Matching uses appearance, not circuit understanding; always verify the results.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>
        <div className="training-controls">
          <label>
            Mark{' '}
            <select
              value={mode}
              onChange={(event) => {
                setMode(event.target.value)
                setPoints([])
              }}
            >
              <option value="component">Component</option>
              <option value="negative">Not a component</option>
              <option value="wire">Straight wire</option>
            </select>
          </label>
          {mode !== 'wire' && (
            <label>
              Dataset{' '}
              <select value={split} onChange={(event) => setSplit(event.target.value)}>
                <option value="train">Training</option>
                <option value="validation">Validation</option>
              </select>
            </label>
          )}
          {mode === 'component' && (
            <>
              {bom.length > 0 && (
                <label>
                  BOM reference{' '}
                  <select
                    value={referenceLabel}
                    onChange={(event) => {
                      const item = bom.find((entry) => entry.label === event.target.value)
                      if (item)
                        applyBomItem(
                          item,
                          selectedWord && matchReference(selectedWord.text, bom, model)?.item === item ? matchReference(selectedWord.text, bom, model).section : '',
                        )
                      else setReferenceLabel('')
                    }}
                  >
                    <option value="">{ocr.loading ? 'Reading labels… (choose later)' : 'Choose reference…'}</option>
                    {[...bom]
                      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
                      .map((item) => (
                        <option value={item.label} key={item.label}>
                          {item.label} · {item.value || findLibraryItem(inferBomType(item, model))?.name || 'no value'}
                          {components.some((component) => [item.label, `${item.label}A`, `${item.label}B`].includes(component.label.toUpperCase())) ? ' (placed)' : ''}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {selectedWord && (
                <button type="button" onClick={resetAssignment} title="Forget the clicked label">
                  Unselect label “{selectedWord.text}”
                </button>
              )}
              <label>
                Component type{' '}
                <select
                  value={familyId}
                  onChange={(event) => {
                    const next = families.find((item) => item.id === event.target.value)
                    setFamilyId(next.id)
                    setType(next.subtypes[0].type)
                  }}
                >
                  {families.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Component subtype{' '}
                <select value={type} onChange={(event) => setType(event.target.value)} disabled={family.subtypes.length === 1}>
                  {family.subtypes.map((item) => (
                    <option value={item.type} key={item.type}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Rotation{' '}
                <select value={rotation} onChange={(event) => setRotation(Number(event.target.value))}>
                  {[0, 90, 180, 270].map((angle) => (
                    <option value={angle} key={angle}>
                      {angle}°
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label>
            Label (optional) <input maxLength={1000} value={label} onChange={(event) => setLabel(event.target.value)} />
          </label>
          <button type="button" className="export-button" disabled={busy || (!labelOnly && (points.length !== 2 || (mode !== 'wire' && !sourceId)))} onClick={saveMark}>
            {mode === 'negative' ? 'Save non-component' : labelOnly ? 'Teach label & add' : 'Save mark & add'}
          </button>
          <button type="button" onClick={find} disabled={busy || !image}>
            {busy ? 'Finding…' : 'Find similar components'}
          </button>
          <button type="button" onClick={experiment} disabled={busy}>
            Run detector experiments
          </button>
          <button type="button" onClick={detectFromBom} disabled={busy || !image || !bom.length} title="Place components for the BOM references found in the image">
            Detect components from BOM
          </button>
          <button type="button" onClick={findLabels} disabled={busy || !image || !bom.length}>
            Find BOM labels
          </button>
          <button
            type="button"
            onClick={() => {
              if (!window.confirm('Delete all local training examples, learned BOM references and the optimized detector? This does not remove circuit elements.')) return
              try {
                clearTraining()
                clearLearned()
                setCount(0)
                setSuggestions([])
                setError('')
                setMessage('Local examples cleared.')
              } catch (reason) {
                setError(reason.message)
              }
            }}
            disabled={busy}
          >
            Clear examples ({count})
          </button>
        </div>
        <p className="training-hint">
          {mode === 'wire'
            ? 'Drag along one horizontal or vertical wire, or click its two endpoints.'
            : mode === 'negative'
              ? 'Mark an area that is not a component, such as text or crossing wires. Use separate images for training and validation.'
              : 'Drag a box tightly around a symbol, excluding its text, or click two opposite corners. Use separate images for training and validation.'}
        </p>
        {mode === 'component' && !bom.length && (
          <p className="training-hint">
            {ocr.loading ? 'Reading the text in the image… ' : ocr.error ? `${ocr.error} ` : ''}
            Text in the drawing, written horizontally or vertically, is read locally. Resistors and capacitors you mark get the value written beside them (47K, 1k5, .02, 220 μμ).
          </p>
        )}
        {mode === 'component' && bom.length > 0 && (
          <p className="training-hint">
            {ocr.loading ? 'Reading the text in the image… ' : ocr.error ? `${ocr.error} ` : ''}
            Click a label (highlighted text) to pick it, choose its BOM reference, then mark its symbol: the symbol, its type, where it sits relative to its label and any OCR
            misread are learned for later imports. Learned from {model.count} BOM assignments so far.
            {loadError && ` ${loadError}`}
          </p>
        )}
        <p className="training-hint">
          For experiments, mark components on two training images and non-components on a training image, then mark both on a separate validation image. Saved detectors use a fixed
          snapshot of training examples.
        </p>
        <div className="training-feedback">
          {error && (
            <p className="import-error" role="alert">
              {error}
            </p>
          )}
          {message && <p role="status">{message}</p>}
        </div>
        <div className="training-image-frame">
          <div className="training-image" {...scrollProps}>
            {image && (
              <svg
                ref={svgRef}
                width={(image.width * zoom) / 100}
                height={(image.height * zoom) / 100}
                viewBox={`0 0 ${image.width} ${image.height}`}
                onPointerDown={startMark}
                onPointerMove={moveMark}
                onPointerUp={finishMark}
                onPointerCancel={cancelMark}
                aria-label="Reference image for marking"
              >
                <image href={reference.dataUrl} width={image.width} height={image.height} />
                {region && (
                  <rect
                    x={(region[0] * image.width) / 1000}
                    y={(region[1] * image.height) / 700}
                    width={((region[2] - region[0]) * image.width) / 1000}
                    height={((region[3] - region[1]) * image.height) / 700}
                    className="training-region"
                  />
                )}
                {points.map((point, index) => (
                  <circle key={index} cx={point[0]} cy={point[1]} r="4" className="training-point" />
                ))}
                {box && mode !== 'wire' && <rect x={box[0]} y={box[1]} width={box[2] - box[0]} height={box[3] - box[1]} className="training-mark" />}
                {points.length === 2 && mode === 'wire' && <line x1={points[0][0]} y1={points[0][1]} x2={points[1][0]} y2={points[1][1]} className="training-mark" />}
                {suggestions.map((item, index) => (
                  <g key={`${item.box.join('-')}-${item.type}`} data-suggestion={index}>
                    <rect x={item.box[0]} y={item.box[1]} width={item.box[2] - item.box[0]} height={item.box[3] - item.box[1]} className="training-suggestion" />
                    <text x={item.box[0]} y={item.box[1] - 3} className="training-number">
                      {index + 1}
                    </text>
                  </g>
                ))}
                {labels.map((item, index) => (
                  <rect key={`${item.x}-${item.y}-${index}`} data-label={index} x={item.x} y={item.y} width={item.width} height={item.height} className="training-suggestion" />
                ))}
                {mode === 'component' &&
                  clickableWords.map((word, index) => (
                    <rect
                      key={`${word.x}-${word.y}-${index}`}
                      data-word={index}
                      x={word.x}
                      y={word.y}
                      width={word.width}
                      height={word.height}
                      className={word === selectedWord ? 'training-word selected' : 'training-word'}
                    />
                  ))}
                {detections.map((item, index) => (
                  <circle key={`center-${item.label}`} data-detection-center={index} cx={item.center[0]} cy={item.center[1]} r="6" className="training-point" />
                ))}
                {detections.map((item, index) => (
                  <rect
                    key={item.label}
                    data-detection={index}
                    x={item.box[0]}
                    y={item.box[1]}
                    width={item.box[2] - item.box[0]}
                    height={item.box[3] - item.box[1]}
                    className="training-suggestion"
                  />
                ))}
              </svg>
            )}
          </div>
          {image && <ZoomControls zoom={zoom} onZoomChange={changeZoom} />}
        </div>
        {suggestions.length > 0 && (
          <div className="training-results">
            {suggestions.map((item, index) => (
              <div key={`${item.box.join('-')}-${item.type}`}>
                <span>
                  #{index + 1} {findLibraryItem(item.type)?.name} · similarity {Math.round(item.score * 100)}%
                </span>
                <button type="button" onClick={() => svgRef.current.querySelector(`[data-suggestion="${index}"]`)?.scrollIntoView({ block: 'center', inline: 'center' })}>
                  Show
                </button>
                <button type="button" onClick={() => accept(index)}>
                  Add
                </button>
                <button type="button" onClick={() => setSuggestions((current) => current.filter((_, position) => position !== index))}>
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        )}
        {detections.length > 0 && (
          <BomDetectionList
            detections={detections}
            onShow={(index) => svgRef.current.querySelector(`[data-detection="${index}"]`)?.scrollIntoView({ block: 'center', inline: 'center' })}
            onAdd={addDetection}
            onAddAll={addAllDetections}
            onDismiss={(index) => setDetections((current) => current.filter((_, position) => position !== index))}
          />
        )}
        {labels.length > 0 && (
          <div className="training-results">
            {labels.map((item, index) => (
              <div key={`${item.x}-${item.y}-${index}`}>
                <span>
                  OCR: {item.text} · BOM: {item.candidate} · confidence {Math.round(item.confidence)}%
                </span>
                <button type="button" onClick={() => svgRef.current.querySelector(`[data-label="${index}"]`)?.scrollIntoView({ block: 'center', inline: 'center' })}>
                  Show
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const selected = bom.find((entry) => entry.label === item.candidate)
                    const suggestedType = selected.type || inferComponentType(item.candidate)
                    const nextFamily = families.find((entry) => entry.subtypes.some((subtype) => subtype.type === suggestedType))
                    if (nextFamily) {
                      setFamilyId(nextFamily.id)
                      setType(suggestedType)
                    }
                    setMode('component')
                    setLabel(item.candidate)
                    setMessage(`Selected ${item.candidate}. Verify the component type, mark its symbol, and save it.`)
                  }}
                >
                  Use label
                </button>
                <button type="button" onClick={() => setLabels((current) => current.filter((_, position) => position !== index))}>
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
