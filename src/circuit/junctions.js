import { distanceToSegment, nearPoint, withoutRepeats } from './geometry.js'
import { isTwoTerminal, boxContains, terminalsOf } from './partGeometry.js'
import { isRibbon } from './ribbon.js'

export const HOP_RADIUS = 5
const SNAP_TOLERANCE = 4
const EPSILON = 0.01

const same = (a, b) => nearPoint(a, b, EPSILON)
const key = ([x, y]) => `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`

// Whether a wire end lands on another wire, away from that wire's own ends, on a segment it is not parallel to (overlapping
// pieces of one straight run do not join there).
function crossesAt({ point, next }, points) {
  if (same(points[0], point) || same(points[points.length - 1], point)) return false
  const direction = [next[0] - point[0], next[1] - point[1]]
  return points.slice(1).some((end, index) => {
    const start = points[index]
    if (distanceToSegment(point, start, end) >= EPSILON) return false
    return Math.abs(direction[0] * (end[1] - start[1]) - direction[1] * (end[0] - start[0])) > EPSILON
  })
}

// Where a dot marks a connection: a wire ending on a component without meeting another wire there (on the terminal itself
// for a two-terminal part), a wire ending across another wire anywhere but that wire's own ends, and three or more wire
// ends meeting at one point. Two wire ends meeting is one wire continued and gets no dot; an end with an off-page arrow
// gets none either.
export function connectionDots(diagram) {
  const drawn = diagram.wires.map((wire) => ({ wire, points: withoutRepeats(wire.points) })).filter(({ points }) => points.length > 1)
  const wires = drawn.map(({ points }) => points)
  const ends = drawn.flatMap(({ wire, points }, wireIndex) => [
    { point: points[0], next: points[1], wireIndex, offPage: Boolean(wire.ends?.start?.marker) },
    { point: points[points.length - 1], next: points[points.length - 2], wireIndex, offPage: Boolean(wire.ends?.end?.marker) },
  ])
  const dots = new Map()
  const add = (point) => dots.set(key(point), point)

  for (const end of ends) {
    // An arrow marks the wire as continuing elsewhere, so its end connects to nothing drawn here.
    if (end.offPage) continue
    const meeting = ends.filter((other) => same(other.point, end.point)).length
    const tee = wires.some((points, index) => index !== end.wireIndex && crossesAt(end, points))
    if (meeting > 1 || tee) {
      if (tee || meeting >= 3) add(end.point)
      continue
    }
    const component = diagram.components
      .filter((item) => boxContains(item, end.point))
      .sort((a, b) => Math.hypot(a.x - end.point[0], a.y - end.point[1]) - Math.hypot(b.x - end.point[0], b.y - end.point[1]))[0]
    if (!component) continue
    const pins = isRibbon(component.type) || isTwoTerminal(component) ? terminalsOf(component).map((terminal) => terminal.point) : []
    const terminal = pins
      .filter((point) => distanceToSegment(point, end.point, end.next) <= SNAP_TOLERANCE)
      .sort((a, b) => Math.hypot(a[0] - end.point[0], a[1] - end.point[1]) - Math.hypot(b[0] - end.point[0], b[1] - end.point[1]))[0]
    add(terminal || end.point)
  }
  return [...dots.values()]
}

// Where a horizontal wire segment crosses a vertical one without connecting: away from either segment's ends and from every
// wire end and bend. Returns, per wire id, the crossing points on its horizontal segments, where it is drawn with a hop.
export function wireHops(diagram) {
  const wires = diagram.wires.map((wire) => ({ id: wire.id, points: withoutRepeats(wire.points) }))
  const vertices = wires.flatMap((wire) => wire.points)
  const segmentsOf = (wire) => wire.points.slice(1).map((end, index) => [wire.points[index], end])
  const horizontal = wires.flatMap((wire) =>
    segmentsOf(wire)
      .filter(([a, b]) => a[1] === b[1] && a[0] !== b[0])
      .map((segment) => ({ id: wire.id, segment })),
  )
  const vertical = wires.flatMap((wire) => segmentsOf(wire).filter(([a, b]) => a[0] === b[0] && a[1] !== b[1])).map((segment) => segment)
  const between = (value, a, b) => value > Math.min(a, b) + EPSILON && value < Math.max(a, b) - EPSILON
  const hops = {}
  for (const { id, segment } of horizontal) {
    const [[ax, y], [bx]] = segment
    for (const [[x, cy], [, dy]] of vertical) {
      if (!between(x, ax, bx) || !between(y, cy, dy)) continue
      if (vertices.some((point) => same(point, [x, y]))) continue
      ;(hops[id] ||= []).push([x, y])
    }
  }
  return hops
}

// The SVG path of a wire, with a small arc bridging each hop on its horizontal segments.
export function wirePath(points, hops = []) {
  const clean = withoutRepeats(points)
  if (!clean.length) return ''
  let path = `M${clean[0][0]} ${clean[0][1]}`
  clean.slice(1).forEach((end, index) => {
    const start = clean[index]
    if (start[1] === end[1] && start[0] !== end[0]) {
      const direction = Math.sign(end[0] - start[0])
      const onSegment = hops.filter(([x, y]) => y === start[1] && (x - start[0]) * direction > 0 && (end[0] - x) * direction > 0).sort((a, b) => (a[0] - b[0]) * direction)
      let reached = start[0]
      for (const [x] of onSegment) {
        const radius = Math.min(HOP_RADIUS, Math.abs(x - reached), Math.abs(end[0] - x))
        if (radius < 1) continue
        // Sweeping clockwise while heading right, or anticlockwise while heading left, bridges over the top.
        path += ` L${x - direction * radius} ${start[1]} A${radius} ${radius} 0 0 ${direction > 0 ? 1 : 0} ${x + direction * radius} ${start[1]}`
        reached = x + direction * radius
      }
    }
    path += ` L${end[0]} ${end[1]}`
  })
  return path
}
