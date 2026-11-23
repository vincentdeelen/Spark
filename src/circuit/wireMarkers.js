// The ends of a wire can be marked as off-page connectors: an arrow and a label (the net or the sheet it continues on).
// Stored on the wire as `ends: { start?: { marker, label }, end?: { marker, label } }`; `start` is its first point.

export const WIRE_END_MARKERS = [
  { value: '', label: 'No arrow' },
  { value: 'arrow-out', label: 'Arrow out (continues on another sheet)' },
  { value: 'arrow-in', label: 'Arrow in (comes from another sheet)' },
]
export const WIRE_ENDS = ['start', 'end']
const ARROW_LENGTH = 12
const ARROW_HALF_WIDTH = 6
const LABEL_GAP = 5

export const validWireEnds = (ends) =>
  ends !== null &&
  typeof ends === 'object' &&
  !Array.isArray(ends) &&
  Object.entries(ends).every(
    ([key, end]) =>
      WIRE_ENDS.includes(key) &&
      end &&
      typeof end === 'object' &&
      WIRE_END_MARKERS.some((marker) => marker.value === (end.marker ?? '')) &&
      (end.label === undefined || (typeof end.label === 'string' && end.label.length <= 1000)),
  )

// The wire with one end's marker or label changed; an end with neither is removed.
export function withWireEnd(wire, key, changes) {
  const end = { ...wire.ends?.[key], ...changes }
  const kept = Object.fromEntries(Object.entries(end).filter(([, value]) => value))
  const ends = { ...wire.ends, [key]: kept }
  if (!Object.keys(kept).length) delete ends[key]
  const rest = { ...wire }
  delete rest.ends
  return Object.keys(ends).length ? { ...rest, ends } : rest
}

// Which end of a wire is nearer a point, e.g. where it was right-clicked.
export function nearestWireEnd(wire, [x, y]) {
  const first = wire.points[0]
  const last = wire.points[wire.points.length - 1]
  return Math.hypot(first[0] - x, first[1] - y) <= Math.hypot(last[0] - x, last[1] - y) ? 'start' : 'end'
}

// The end point of a wire and the direction the wire runs as it reaches it.
function endGeometry(points, key) {
  const ordered = key === 'start' ? points : [...points].reverse()
  const tip = ordered[0]
  const before = ordered.find((point) => point[0] !== tip[0] || point[1] !== tip[1]) || [tip[0] - 1, tip[1]]
  const length = Math.hypot(tip[0] - before[0], tip[1] - before[1])
  return { point: tip, direction: [(tip[0] - before[0]) / length, (tip[1] - before[1]) / length] }
}

const round = (value) => Math.round(value * 100) / 100

// What to draw at each marked end: the arrow outline (if any) and where its label goes.
export function wireEndMarkers(wire) {
  return WIRE_ENDS.filter((key) => wire.ends?.[key]?.marker || wire.ends?.[key]?.label).map((key) => {
    const { marker = '', label = '' } = wire.ends[key]
    const {
      point: [x, y],
      direction: [dx, dy],
    } = endGeometry(wire.points, key)
    const at = (along, across) => [round(x + dx * along - dy * across), round(y + dy * along + dx * across)]
    let arrow = null
    if (marker === 'arrow-out') arrow = [at(0, ARROW_HALF_WIDTH), at(ARROW_LENGTH, 0), at(0, -ARROW_HALF_WIDTH)]
    if (marker === 'arrow-in') arrow = [at(ARROW_LENGTH, ARROW_HALF_WIDTH), at(0, 0), at(ARROW_LENGTH, -ARROW_HALF_WIDTH)]
    const [labelX, labelY] = at((marker ? ARROW_LENGTH : 0) + LABEL_GAP, 0)
    const horizontal = Math.abs(dx) >= Math.abs(dy)
    return {
      key,
      arrow: arrow && arrow.map((point) => point.join(',')).join(' '),
      label,
      x: labelX,
      y: horizontal ? round(labelY + 4) : round(labelY + (dy > 0 ? 9 : -2)),
      anchor: horizontal ? (dx > 0 ? 'start' : 'end') : 'middle',
    }
  })
}
