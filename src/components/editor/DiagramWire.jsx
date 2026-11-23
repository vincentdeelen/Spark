import { wirePath } from '../../circuit/junctions.js'
import { wireLabelPosition } from '../../circuit/sections.js'
import { wireEndMarkers } from '../../circuit/wireMarkers.js'
import './DiagramWire.css'

export default function DiagramWire({ wire, hops, selected, onSelect, onContextMenu }) {
  const [labelX, labelY] = wireLabelPosition(wire.points)
  const points = wire.points.map((point) => point.join(',')).join(' ')
  return (
    <g onClick={onSelect} onContextMenu={onContextMenu}>
      <polyline points={points} className="wire-hit" />
      <path d={wirePath(wire.points, hops)} className={selected ? 'wire selected-wire' : 'wire'} />
      {wireEndMarkers(wire).map((marker) => (
        <g key={marker.key} className={selected ? 'wire-end selected-wire-end' : 'wire-end'}>
          {marker.arrow && <polygon className="wire-arrow" points={marker.arrow} />}
          {marker.label && (
            <text className="wire-end-label" x={marker.x} y={marker.y} textAnchor={marker.anchor}>
              {marker.label}
            </text>
          )}
        </g>
      ))}
      {wire.label && (
        <text className="wire-label" x={labelX} y={labelY} textAnchor="middle">
          {wire.label}
        </text>
      )}
    </g>
  )
}
