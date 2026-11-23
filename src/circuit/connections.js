import { GRID_SIZE, snapToGrid as snap } from '../shared/grid.js'
import { MIN_ZOOM } from '../shared/zoom.js'
import { pointOnSegment, segmentsOf } from './geometry.js'
import { detailedTubeTypes } from '../tubes/triodes.js'
import { isTwoTerminal, scaleOf, terminalsOf } from './partGeometry.js'

function segmentsIntersect(a, b, c, d) {
  const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
  const abC = cross(a, b, c)
  const abD = cross(a, b, d)
  const cdA = cross(c, d, a)
  const cdB = cross(c, d, b)
  if (abC === 0 && pointOnSegment(c, a, b)) return true
  if (abD === 0 && pointOnSegment(d, a, b)) return true
  if (cdA === 0 && pointOnSegment(a, c, d)) return true
  if (cdB === 0 && pointOnSegment(b, c, d)) return true
  return abC * abD < 0 && cdA * cdB < 0
}

const segments = (wire) => segmentsOf(wire.points)

function bounds(component) {
  const scale = scaleOf(component)
  const halfWidth = (detailedTubeTypes.includes(component.type) ? 168 : 48) * scale
  const halfHeight = (detailedTubeTypes.includes(component.type) ? 168 : component.type === 'potentiometer' ? 48 : 36) * scale
  return [component.x - halfWidth, component.y - halfHeight, component.x + halfWidth, component.y + halfHeight]
}

function rectanglesIntersect(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1]
}

function segmentIntersectsBounds([a, b], [left, top, right, bottom]) {
  const inside = ([x, y]) => x >= left && x <= right && y >= top && y <= bottom
  const corners = [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ]
  return inside(a) || inside(b) || corners.some((point, index) => segmentsIntersect(a, b, point, corners[(index + 1) % 4]))
}

export function prepareArrangement(diagram, componentIds, mode, makeId) {
  const selected = componentIds.map((id) => diagram.components.find((component) => component.id === id))
  if (selected.length < 2 || new Set(componentIds).size !== componentIds.length || selected.some((component) => !component || !isTwoTerminal(component))) {
    return { error: 'Select at least two two-terminal components.' }
  }
  if (!['series', 'parallel'].includes(mode)) return { error: 'Unknown connection arrangement.' }

  const selectedIds = new Set(componentIds)
  const oldTerminals = selected.flatMap((component) => terminalsOf(component).map((terminal) => terminal.point))
  const groups = new Set(diagram.wires.filter((wire) => wire.connectionGroup && wire.componentIds?.some((id) => selectedIds.has(id))).map((wire) => wire.connectionGroup))
  const removedWires = diagram.wires.filter(
    (wire) => groups.has(wire.connectionGroup) || segments(wire).some(([a, b]) => oldTerminals.some((point) => pointOnSegment(point, a, b))),
  )
  const removedIds = new Set(removedWires.map((wire) => wire.id))
  const remainingWires = diagram.wires.filter((wire) => !removedIds.has(wire.id))
  const otherComponents = diagram.components.filter((component) => !selectedIds.has(component.id))
  const centerX = snap(selected.reduce((sum, component) => sum + component.x, 0) / selected.length)
  const centerY = snap(selected.reduce((sum, component) => sum + component.y, 0) / selected.length)
  const unit = Math.max(...selected.map(scaleOf))
  const pitch = Math.ceil((120 * unit) / GRID_SIZE) * GRID_SIZE
  const first = snap((mode === 'series' ? centerX : centerY) - ((selected.length - 1) * pitch) / 2)
  const arranged = selected.map((component, index) => ({
    ...component,
    x: mode === 'series' ? first + index * pitch : centerX,
    y: mode === 'parallel' ? first + index * pitch : centerY,
    rotation: 0,
  }))
  const reachOf = (component) => 40 * scaleOf(component)
  const group = makeId()
  const newWires = []
  const addWire = (points) => newWires.push({ id: makeId(), points, connectionGroup: group, componentIds: [...componentIds] })

  if (mode === 'series') {
    arranged.slice(1).forEach((component, index) =>
      addWire([
        [arranged[index].x + reachOf(arranged[index]), centerY],
        [component.x - reachOf(component), centerY],
      ]),
    )
  } else {
    const rail = 40 * unit + 40
    const top = arranged[0].y
    const bottom = arranged[arranged.length - 1].y
    addWire([
      [centerX - rail, top],
      [centerX - rail, bottom],
    ])
    addWire([
      [centerX + rail, top],
      [centerX + rail, bottom],
    ])
    arranged.forEach((component) => {
      addWire([
        [centerX - rail, component.y],
        [centerX - reachOf(component), component.y],
      ])
      addWire([
        [centerX + reachOf(component), component.y],
        [centerX + rail, component.y],
      ])
    })
  }

  const newSegments = newWires.flatMap(segments)
  const retainedSegments = remainingWires.flatMap(segments)
  const collision =
    newSegments.some(([a, b]) => retainedSegments.some(([c, d]) => segmentsIntersect(a, b, c, d))) ||
    arranged.some((component) => retainedSegments.some((segment) => segmentIntersectsBounds(segment, bounds(component)))) ||
    otherComponents.some(
      (component) =>
        arranged.some((item) => rectanglesIntersect(bounds(component), bounds(item))) || newSegments.some((segment) => segmentIntersectsBounds(segment, bounds(component))),
    )
  if (collision) return { error: 'The new layout would overlap another component or wire. Move the selection to an open area and try again.' }

  const layoutBounds = arranged.map(bounds)
  const minX = Math.min(...layoutBounds.map((box) => box[0]), ...newWires.flatMap((wire) => wire.points.map((point) => point[0])))
  const maxX = Math.max(...layoutBounds.map((box) => box[2]), ...newWires.flatMap((wire) => wire.points.map((point) => point[0])))
  const minY = Math.min(...layoutBounds.map((box) => box[1]), ...newWires.flatMap((wire) => wire.points.map((point) => point[1])))
  const maxY = Math.max(...layoutBounds.map((box) => box[3]), ...newWires.flatMap((wire) => wire.points.map((point) => point[1])))
  const neededZoom = Math.min(100, 50000 / Math.max(1, 500 - minX + 20, maxX - 500 + 20), 35000 / Math.max(1, 350 - minY + 20, maxY - 350 + 20))
  if (neededZoom < MIN_ZOOM) return { error: 'The arrangement would be outside the visible canvas. Move the selection closer to the center or select fewer components.' }

  const replacements = new Map(arranged.map((component) => [component.id, component]))
  return {
    diagram: { ...diagram, components: diagram.components.map((component) => replacements.get(component.id) || component), wires: [...remainingWires, ...newWires] },
    removedWires,
    maxZoom: Math.floor(neededZoom / 10) * 10,
  }
}
