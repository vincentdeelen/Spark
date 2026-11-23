import { formatComponentValue } from '../../circuit/ratings.js'
import { scaleOf, selectionBoxOf } from '../../circuit/partGeometry.js'
import { LABEL_SIZE, labelPlacementOf } from '../../circuit/labelLayout.js'
import CircuitSymbol from '../symbols/CircuitSymbol.jsx'
import './DiagramComponent.css'

const HANDLE = 12

export default function DiagramComponent({ component, selected, onPointerDown, onClick, onResizeStart, onContextMenu }) {
  const { box: selectionBox, rotation: boxRotation } = selectionBoxOf(component)
  const label = labelPlacementOf(component)
  const value = formatComponentValue(component)
  return (
    <g
      data-component-id={component.id}
      transform={`translate(${component.x} ${component.y})`}
      onPointerDown={(event) => onPointerDown(event, component)}
      onClick={onClick}
      onContextMenu={onContextMenu && ((event) => onContextMenu(event, component))}
      className="diagram-component"
    >
      <title className="editor-only">{value ? `${component.label} · ${value}` : component.label}</title>
      <g transform={boxRotation ? `rotate(${boxRotation})` : undefined}>
        <rect className="hit-area editor-only" {...selectionBox} />
        {selected && <rect className="selection-box editor-only" {...selectionBox} rx="5" />}
        {selected &&
          onResizeStart &&
          [
            ['nw', selectionBox.x, selectionBox.y],
            ['ne', selectionBox.x + selectionBox.width, selectionBox.y],
            ['sw', selectionBox.x, selectionBox.y + selectionBox.height],
            ['se', selectionBox.x + selectionBox.width, selectionBox.y + selectionBox.height],
          ].map(([corner, x, y]) => (
            <rect
              key={corner}
              className={`resize-handle resize-${corner} editor-only`}
              data-resize-handle={corner}
              x={x - HANDLE / 2}
              y={y - HANDLE / 2}
              width={HANDLE}
              height={HANDLE}
              rx="2"
              onPointerDown={(event) => onResizeStart(event, component)}
            />
          ))}
      </g>
      <g transform={`rotate(${component.rotation}) scale(${scaleOf(component)})`}>
        <CircuitSymbol type={component.type} speed={component.speed} section={component.section} pins={component.pins} />
      </g>
      {component.type !== 'ground' && (
        <text x={label.x} y={label.y} textAnchor={label.anchor} className="component-label" style={label.size === LABEL_SIZE ? undefined : { fontSize: label.size }}>
          {component.label}
        </text>
      )}
    </g>
  )
}
