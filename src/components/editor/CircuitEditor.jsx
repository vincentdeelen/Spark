import { useLayoutEffect, useMemo, useRef } from 'react'
import { BASE_EXTENT, canvasExtent } from '../../circuit/canvasExtent.js'
import { findLibraryItem } from '../../circuit/library.js'
import { catalogEntryOfTool, catalogName } from '../../circuit/transformerCatalog.js'
import { GRID_SIZE } from '../../shared/grid.js'
import useZoomScroll from '../../hooks/useZoomScroll.js'
import { connectionDots, wireHops } from '../../circuit/junctions.js'
import CanvasToolbar from './CanvasToolbar.jsx'
import DiagramComponent from './DiagramComponent.jsx'
import DiagramWire from './DiagramWire.jsx'
import SectionForm from './SectionForm.jsx'
import ZoomControls from './ZoomControls.jsx'
import '../../styles/buttons.css'
import '../../styles/indicators.css'
import './CircuitEditor.css'

const [, , CANVAS_WIDTH, CANVAS_HEIGHT] = BASE_EXTENT
// How close to the edge of the view, in pixels, the pointer scrolls it while a wire is drawn.
const AUTO_SCROLL_EDGE = 40
const AUTO_SCROLL_STEP = 20

// A prompt for the step an action is waiting for; nothing while simply editing.
function canvasHint({ tool, multiSelect, sectionStart, wireStart, override }) {
  if (override) return override
  if (tool === 'section') return sectionStart ? 'Click the opposite corner' : 'Click the first corner of the section'
  if (tool === 'wire') return wireStart ? 'Click to finish your wire' : 'Click to start drawing a wire'
  if (multiSelect) return 'Click components to add or remove them'
  if (tool === 'select') return ''
  const catalogEntry = catalogEntryOfTool(tool)
  return `Click on the canvas to place ${catalogEntry ? catalogName(catalogEntry) : findLibraryItem(tool)?.name.toLowerCase()}`
}

// Rectangle given by two corners, used for the section being drawn and the one awaiting a name.
function SectionOutline({ from, to }) {
  return (
    <rect className="section-preview editor-only" x={Math.min(from[0], to[0])} y={Math.min(from[1], to[1])} width={Math.abs(from[0] - to[0])} height={Math.abs(from[1] - to[1])} />
  )
}

// `section` bundles everything about linked sections: the visible region of this view and the draft being drawn.
export default function CircuitEditor({
  projectName,
  diagram,
  selectedIds,
  tool,
  wireStart,
  cursor,
  zoom,
  svgRef,
  multiSelect,
  canUndo,
  canRedo,
  canTidy,
  arrangement,
  showReference,
  section,
  onMultiSelectChange,
  onToolChange,
  onUndo,
  onRedo,
  onOptimizeLabels,
  onRearrange,
  onCanvasClick,
  onPointerMove,
  onPointerUp,
  onPointerLeave,
  onResizeStart,
  onComponentContextMenu,
  onWireContextMenu,
  hint,
  onDragOver,
  onDrop,
  onWireSelect,
  onComponentPointerDown,
  onComponentClick,
  onZoomChange,
  onToggleReference,
  onRemoveReference,
  onTeach,
}) {
  const { region, clipId } = section
  // A linked section shows its region; a circuit shows the drawing area, which grows with the drawing and with a wire
  // being drawn towards an edge. The grid keeps its on-screen size, so a larger area scrolls instead of shrinking.
  const growPoint = wireStart && cursor
  const bounds = region || canvasExtent(diagram, growPoint)
  const width = bounds[2] - bounds[0]
  const height = bounds[3] - bounds[1]
  const viewBox = `${bounds[0]} ${bounds[1]} ${width} ${height}`
  const sizeFactor = region ? 1 : width / CANVAS_WIDTH
  const { scrollProps, changeZoom } = useZoomScroll(zoom, onZoomChange)
  const [left, top] = bounds
  const origin = useRef([left, top])

  // Growing to the left or top moves the drawing right or down inside the canvas; scroll by the same amount so it stays put.
  useLayoutEffect(() => {
    const svg = svgRef.current
    const area = svg?.parentElement
    const [previousLeft, previousTop] = origin.current
    origin.current = [left, top]
    if (!area || !svg || (previousLeft === left && previousTop === top)) return
    const pixels = svg.clientWidth / width
    area.scrollBy((previousLeft - left) * pixels, (previousTop - top) * pixels)
  }, [left, top, svgRef, width])

  // While a wire is drawn, pointing near the edge of the view scrolls towards it, into the area the grid grew into.
  const movePointer = (event) => {
    onPointerMove(event)
    const area = svgRef.current?.parentElement
    if (!wireStart || !area) return
    const box = area.getBoundingClientRect()
    const dx = event.clientX < box.left + AUTO_SCROLL_EDGE ? -AUTO_SCROLL_STEP : event.clientX > box.right - AUTO_SCROLL_EDGE ? AUTO_SCROLL_STEP : 0
    const dy = event.clientY < box.top + AUTO_SCROLL_EDGE ? -AUTO_SCROLL_STEP : event.clientY > box.bottom - AUTO_SCROLL_EDGE ? AUTO_SCROLL_STEP : 0
    if (dx || dy) area.scrollBy(dx, dy)
  }
  const hops = useMemo(() => wireHops(diagram), [diagram])
  const dots = useMemo(() => connectionDots(diagram), [diagram])
  const hintText = canvasHint({ tool, multiSelect, sectionStart: section.start, wireStart, override: hint })
  return (
    <main className="editor">
      <div className="canvas-card">
        <CanvasToolbar
          projectName={projectName}
          tool={tool}
          multiSelect={multiSelect}
          canUndo={canUndo}
          canRedo={canRedo}
          canTidy={canTidy}
          onOptimizeLabels={onOptimizeLabels}
          onRearrange={onRearrange}
          onToolChange={onToolChange}
          onMultiSelectChange={onMultiSelectChange}
          onUndo={onUndo}
          onRedo={onRedo}
        />
        <div className="canvas-viewport">
          <div className="canvas-scroll" {...scrollProps}>
            <svg
              ref={svgRef}
              style={{ width: `${zoom * sizeFactor}%`, aspectRatio: `${width} / ${height}` }}
              className={`drawing-canvas ${tool !== 'select' ? 'placing' : ''}`}
              viewBox={viewBox}
              onClick={onCanvasClick}
              onPointerMove={movePointer}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerLeave}
              onDragOver={onDragOver}
              onDrop={onDrop}
              aria-label="Circuit drawing canvas"
            >
              <defs>
                <pattern id="grid" width={GRID_SIZE} height={GRID_SIZE} patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="1" fill="#d5dbe5" />
                </pattern>
                {region && (
                  <clipPath id={clipId}>
                    <rect x={region[0]} y={region[1]} width={region[2] - region[0]} height={region[3] - region[1]} />
                  </clipPath>
                )}
              </defs>
              <rect x={bounds[0]} y={bounds[1]} width={width} height={height} fill="#fff" />
              <rect x={bounds[0]} y={bounds[1]} width={width} height={height} fill="url(#grid)" />
              <g clipPath={region ? `url(#${clipId})` : undefined}>
                {diagram.reference && showReference && (
                  <image href={diagram.reference.dataUrl} x="0" y="0" width={CANVAS_WIDTH} height={CANVAS_HEIGHT} opacity="0.35" pointerEvents="none" />
                )}
                <g className="diagram-wires">
                  {diagram.wires.map((wire) => (
                    <DiagramWire
                      key={wire.id}
                      wire={wire}
                      hops={hops[wire.id]}
                      selected={selectedIds.includes(wire.id)}
                      onContextMenu={(event) => onWireContextMenu(event, wire)}
                      onSelect={(event) => {
                        if (tool !== 'select') return
                        event.stopPropagation()
                        onWireSelect(wire.id, event)
                      }}
                    />
                  ))}
                </g>
                {diagram.components.map((component) => (
                  <DiagramComponent
                    key={component.id}
                    component={component}
                    selected={selectedIds.includes(component.id)}
                    onPointerDown={onComponentPointerDown}
                    onClick={onComponentClick}
                    onContextMenu={onComponentContextMenu}
                    onResizeStart={selectedIds.length === 1 && tool === 'select' ? onResizeStart : undefined}
                  />
                ))}
                <g className="junction-dots">
                  {dots.map(([x, y]) => (
                    <circle key={`${x},${y}`} className="junction-dot" cx={x} cy={y} r="3" />
                  ))}
                </g>
                {wireStart && cursor && <polyline className="wire-preview editor-only" points={`${wireStart.join(',')} ${cursor[0]},${wireStart[1]} ${cursor.join(',')}`} />}
                {wireStart && <circle className="editor-only" cx={wireStart[0]} cy={wireStart[1]} r="4" fill="#7357dc" />}
                {section.start && cursor && <SectionOutline from={section.start} to={cursor} />}
                {section.pending && <SectionOutline from={[section.pending[0], section.pending[1]]} to={[section.pending[2], section.pending[3]]} />}
              </g>
            </svg>
          </div>
          {hintText && (
            <div className="canvas-hint">
              <span className="hint-spark">✳</span>
              {hintText}
            </div>
          )}
          {arrangement && (
            <div className="arrangement-bar" role="status">
              <span>{arrangement.text}</span>
              <button className="arrangement-keep" onClick={arrangement.onKeep}>
                Keep
              </button>
              <button className="arrangement-revert" onClick={arrangement.onRevert}>
                Revert
              </button>
            </div>
          )}
          {section.error && !section.pending && (
            <p className="section-error" role="alert">
              {section.error}
            </p>
          )}
          {section.pending && <SectionForm name={section.name} error={section.error} onNameChange={section.onNameChange} onCreate={section.onCreate} onCancel={section.onCancel} />}
          <ZoomControls zoom={zoom} onZoomChange={changeZoom} />
        </div>
        <div className="canvas-footer">
          <div>
            <span className="footer-grid">▦</span> Grid enabled <span className="footer-separator">|</span> Snap to grid{' '}
            {diagram.reference && (
              <>
                <span className="footer-separator">|</span>
                <button className="reference-button" onClick={onToggleReference}>
                  {showReference ? 'Hide reference' : 'Show reference'}
                </button>
                <button className="reference-button" onClick={onTeach}>
                  Teach &amp; review
                </button>
                <button className="reference-button" onClick={onRemoveReference}>
                  Remove reference
                </button>
              </>
            )}
          </div>
          <div>
            {diagram.components.length} components <span className="footer-separator">·</span> {diagram.wires.length} wires{region ? ' in shared circuit' : ''}
          </div>
        </div>
      </div>
      <div className="bottom-note">
        <span>✦</span> A little spark can become something great. <span className="note-right">MADE FOR CURIOUS MINDS</span>
      </div>
    </main>
  )
}
